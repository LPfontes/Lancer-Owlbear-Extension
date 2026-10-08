package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"compcon-sync-server/internal/models"

	_ "modernc.org/sqlite"
)

// SQLiteStore implementa a interface Store utilizando o driver modernc.org/sqlite puro (sem CGO).
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore inicializa o banco SQLite com pragmas WAL e cria o esquema de tabelas.
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	// Cria o diretório de dados se não for banco em memória
	if dbPath != ":memory:" && !strings.HasPrefix(dbPath, "file:") {
		dir := filepath.Dir(dbPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("falha ao criar diretório para banco SQLite: %w", err)
		}
	}

	dsn := fmt.Sprintf("%s?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("falha ao abrir conexão SQLite: %w", err)
	}

	// Limita pool para evitar travamentos de concorrência em gravações SQLite
	db.SetMaxOpenConns(1)

	store := &SQLiteStore{db: db}
	if err := store.initSchema(); err != nil {
		db.Close()
		return nil, fmt.Errorf("falha ao criar tabelas: %w", err)
	}
	if err := store.migrateSchema(); err != nil {
		db.Close()
		return nil, err
	}

	return store, nil
}

func (s *SQLiteStore) initSchema() error {
	query := `
	CREATE TABLE IF NOT EXISTS rooms (
		room_id TEXT PRIMARY KEY,
		active_tracker TEXT,
		updated_at INTEGER
	);

	CREATE TABLE IF NOT EXISTS sheets (
		room_id TEXT,
		character_id TEXT,
		character_type TEXT,
		data TEXT,
		in_combat INTEGER,
		version INTEGER,
		updated_at INTEGER,
		owner_id TEXT,
		sheet_id TEXT,
		PRIMARY KEY (room_id, character_id)
	);

	CREATE INDEX IF NOT EXISTS idx_sheets_room ON sheets(room_id);
	`
	_, err := s.db.Exec(query)
	return err
}

// migrateSchema adiciona colunas introduzidas depois do esquema inicial: o
// `CREATE TABLE IF NOT EXISTS` acima não altera tabelas já existentes, então um
// banco criado por versão anterior ficaria sem `owner_id`/`sheet_id`.
func (s *SQLiteStore) migrateSchema() error {
	rows, err := s.db.Query("PRAGMA table_info(sheets)")
	if err != nil {
		return fmt.Errorf("falha ao inspecionar esquema de sheets: %w", err)
	}
	defer rows.Close()

	hasOwnerID := false
	hasSheetID := false
	for rows.Next() {
		var cid, notNull, pk int
		var name, colType string
		var defaultValue sql.NullString

		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultValue, &pk); err != nil {
			return fmt.Errorf("falha ao ler coluna de sheets: %w", err)
		}
		if name == "owner_id" {
			hasOwnerID = true
		}
		if name == "sheet_id" {
			hasSheetID = true
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("falha ao percorrer esquema de sheets: %w", err)
	}

	if !hasOwnerID {
		if _, err := s.db.Exec("ALTER TABLE sheets ADD COLUMN owner_id TEXT"); err != nil {
			return fmt.Errorf("falha ao adicionar coluna owner_id: %w", err)
		}
	}
	if !hasSheetID {
		if _, err := s.db.Exec("ALTER TABLE sheets ADD COLUMN sheet_id TEXT"); err != nil {
			return fmt.Errorf("falha ao adicionar coluna sheet_id: %w", err)
		}
	}

	return nil
}

// SaveRoomState persiste o estado de uma sala e suas fichas em uma transação atômica.
func (s *SQLiteStore) SaveRoomState(roomID string, sheets map[string]*models.SheetStateEntry, tracker json.RawMessage) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now().UnixMilli()

	// 1. Atualiza ou insere registro da sala
	trackerStr := ""
	if len(tracker) > 0 {
		trackerStr = string(tracker)
	}

	upsertRoom := `
	INSERT INTO rooms (room_id, active_tracker, updated_at)
	VALUES (?, ?, ?)
	ON CONFLICT(room_id) DO UPDATE SET
		active_tracker = excluded.active_tracker,
		updated_at = excluded.updated_at;
	`
	if _, err := tx.Exec(upsertRoom, roomID, trackerStr, now); err != nil {
		return fmt.Errorf("falha ao salvar sala: %w", err)
	}

	// 2. Upsert nas fichas atuais
	activeIDs := make([]interface{}, 0, len(sheets))
	upsertSheet := `
	INSERT INTO sheets (room_id, character_id, character_type, data, in_combat, version, updated_at, owner_id, sheet_id)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(room_id, character_id) DO UPDATE SET
		character_type = excluded.character_type,
		data = excluded.data,
		in_combat = excluded.in_combat,
		version = excluded.version,
		updated_at = excluded.updated_at,
		owner_id = excluded.owner_id,
		sheet_id = excluded.sheet_id;
	`

	for id, sheet := range sheets {
		activeIDs = append(activeIDs, id)
		inCombatInt := 0
		if sheet.InCombat {
			inCombatInt = 1
		}
		dataStr := string(sheet.Data)

		if _, err := tx.Exec(upsertSheet, roomID, sheet.CharacterID, sheet.CharacterType, dataStr, inCombatInt, sheet.Version, sheet.UpdatedAt, sheet.OwnerID, sheet.SheetID); err != nil {
			return fmt.Errorf("falha ao salvar ficha %s: %w", id, err)
		}
	}

	// 3. Remove fichas que não estão mais no mapa da sala
	if len(activeIDs) > 0 {
		placeholders := strings.Repeat("?,", len(activeIDs))
		placeholders = placeholders[:len(placeholders)-1]
		deleteQuery := fmt.Sprintf("DELETE FROM sheets WHERE room_id = ? AND character_id NOT IN (%s)", placeholders)
		args := append([]interface{}{roomID}, activeIDs...)
		if _, err := tx.Exec(deleteQuery, args...); err != nil {
			return fmt.Errorf("falha ao limpar fichas removidas: %w", err)
		}
	} else {
		// Todas as fichas foram removidas
		if _, err := tx.Exec("DELETE FROM sheets WHERE room_id = ?", roomID); err != nil {
			return fmt.Errorf("falha ao limpar todas as fichas: %w", err)
		}
	}

	return tx.Commit()
}

// LoadRoomState recupera o estado de uma sala e suas fichas do SQLite.
func (s *SQLiteStore) LoadRoomState(roomID string) (map[string]*models.SheetStateEntry, json.RawMessage, error) {
	sheets := make(map[string]*models.SheetStateEntry)
	var tracker json.RawMessage

	// 1. Carrega o tracker da sala
	var trackerStr sql.NullString
	err := s.db.QueryRow("SELECT active_tracker FROM rooms WHERE room_id = ?", roomID).Scan(&trackerStr)
	if err != nil && err != sql.ErrNoRows {
		return nil, nil, fmt.Errorf("falha ao buscar sala: %w", err)
	}
	if trackerStr.Valid && len(trackerStr.String) > 0 {
		tracker = json.RawMessage(trackerStr.String)
	}

	// 2. Carrega as fichas da sala
	rows, err := s.db.Query("SELECT character_id, character_type, data, in_combat, version, updated_at, COALESCE(owner_id, ''), COALESCE(sheet_id, '') FROM sheets WHERE room_id = ?", roomID)
	if err != nil {
		return nil, nil, fmt.Errorf("falha ao buscar fichas: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id, charType, dataStr, ownerID, sheetID string
		var inCombatInt int
		var version, updatedAt int64

		if err := rows.Scan(&id, &charType, &dataStr, &inCombatInt, &version, &updatedAt, &ownerID, &sheetID); err != nil {
			return nil, nil, fmt.Errorf("falha ao ler linha de ficha: %w", err)
		}

		sheets[id] = &models.SheetStateEntry{
			CharacterID:   id,
			CharacterType: charType,
			Data:          json.RawMessage(dataStr),
			InCombat:      inCombatInt == 1,
			Version:       version,
			UpdatedAt:     updatedAt,
			OwnerID:       ownerID,
			SheetID:       sheetID,
		}
	}

	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	return sheets, tracker, nil
}

// Close fecha o banco de dados.
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}
