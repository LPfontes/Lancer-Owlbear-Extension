package storage

import (
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"

	"compcon-sync-server/internal/models"
)

func TestSQLiteStore_SaveAndLoad(t *testing.T) {
	store, err := NewSQLiteStore(":memory:")
	if err != nil {
		t.Fatalf("Falha ao inicializar SQLiteStore em memória: %v", err)
	}
	defer store.Close()

	roomID := "room-123"
	sheets := map[string]*models.SheetStateEntry{
		"pilot-1": {
			CharacterID:   "pilot-1",
			CharacterType: "pilot",
			Data:          json.RawMessage(`{"callsign":"ZEUS","hp":14}`),
			InCombat:      true,
			Version:       1,
			UpdatedAt:     1000,
			OwnerID:       "player_7",
			SheetID:       "sheet-abc",
		},
		"npc-1": {
			CharacterID:   "npc-1",
			CharacterType: "npc",
			Data:          json.RawMessage(`{"name":"Assault #1","hp":10}`),
			InCombat:      true,
			Version:       1,
			UpdatedAt:     1000,
		},
	}
	tracker := json.RawMessage(`{"round":1,"inTurnId":"pilot-1"}`)

	// 1. Salva estado
	if err := store.SaveRoomState(roomID, sheets, tracker); err != nil {
		t.Fatalf("Erro ao salvar estado da sala: %v", err)
	}

	// 2. Carrega estado
	loadedSheets, loadedTracker, err := store.LoadRoomState(roomID)
	if err != nil {
		t.Fatalf("Erro ao carregar estado da sala: %v", err)
	}

	if len(loadedSheets) != 2 {
		t.Fatalf("Esperava 2 fichas, obteve %d", len(loadedSheets))
	}

	p1, ok := loadedSheets["pilot-1"]
	if !ok {
		t.Fatal("Ficha pilot-1 não encontrada")
	}
	if !p1.InCombat {
		t.Fatal("Esperava pilot-1 InCombat = true")
	}
	if p1.Version != 1 {
		t.Fatalf("Esperava versão 1, obteve %d", p1.Version)
	}
	if p1.OwnerID != "player_7" {
		t.Fatalf("Esperava OwnerID player_7 persistido, obteve %q", p1.OwnerID)
	}
	if p1.SheetID != "sheet-abc" {
		t.Fatalf("Esperava SheetID persitido, obteve %q", p1.SheetID)
	}
	if npc := loadedSheets["npc-1"]; npc.OwnerID != "" {
		t.Fatalf("Ficha sem dono deveria voltar vazia, obteve %q", npc.OwnerID)
	}

	if string(loadedTracker) != string(tracker) {
		t.Fatalf("Tracker divergente. Esperava %s, obteve %s", string(tracker), string(loadedTracker))
	}

	// 3. Atualiza pilot-1 e remove npc-1
	delete(loadedSheets, "npc-1")
	p1.Version = 2
	p1.Data = json.RawMessage(`{"callsign":"ZEUS","hp":9}`)

	if err := store.SaveRoomState(roomID, loadedSheets, tracker); err != nil {
		t.Fatalf("Erro ao salvar estado atualizado: %v", err)
	}

	reloadedSheets, _, err := store.LoadRoomState(roomID)
	if err != nil {
		t.Fatalf("Erro ao recarregar estado: %v", err)
	}

	if len(reloadedSheets) != 1 {
		t.Fatalf("Esperava 1 ficha após remoção, obteve %d", len(reloadedSheets))
	}
	if _, exists := reloadedSheets["npc-1"]; exists {
		t.Fatal("Ficha npc-1 ainda existe após remoção")
	}
	if reloadedSheets["pilot-1"].Version != 2 {
		t.Fatalf("Esperava versão 2, obteve %d", reloadedSheets["pilot-1"].Version)
	}
}

// TestSQLiteStore_MigratesLegacySchema garante que um banco criado antes da coluna
// owner_id continua abrindo: a migração adiciona a coluna e as fichas antigas
// voltam sem dono, até serem reanunciadas por um jogador.
func TestSQLiteStore_MigratesLegacySchema(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "legacy.db")

	legacy, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Falha ao abrir banco legado: %v", err)
	}
	legacySchema := `
	CREATE TABLE rooms (room_id TEXT PRIMARY KEY, active_tracker TEXT, updated_at INTEGER);
	CREATE TABLE sheets (
		room_id TEXT,
		character_id TEXT,
		character_type TEXT,
		data TEXT,
		in_combat INTEGER,
		version INTEGER,
		updated_at INTEGER,
		PRIMARY KEY (room_id, character_id)
	);
	`
	if _, err := legacy.Exec(legacySchema); err != nil {
		t.Fatalf("Falha ao criar esquema legado: %v", err)
	}
	if _, err := legacy.Exec(
		"INSERT INTO sheets (room_id, character_id, character_type, data, in_combat, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		"room-legacy", "pilot-1", "pilot", `{"callsign":"LEGACY"}`, 1, 1, 500,
	); err != nil {
		t.Fatalf("Falha ao inserir ficha legada: %v", err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatalf("Falha ao fechar banco legado: %v", err)
	}

	store, err := NewSQLiteStore(dbPath)
	if err != nil {
		t.Fatalf("Falha ao reabrir banco legado com migração: %v", err)
	}
	defer store.Close()

	sheets, _, err := store.LoadRoomState("room-legacy")
	if err != nil {
		t.Fatalf("Erro ao carregar sala legada: %v", err)
	}
	p1, ok := sheets["pilot-1"]
	if !ok {
		t.Fatal("Ficha legada pilot-1 não foi carregada")
	}
	if p1.OwnerID != "" {
		t.Fatalf("Ficha legada deveria voltar sem dono, obteve %q", p1.OwnerID)
	}

	// Depois da migração, gravar e reler preserva o dono
	p1.OwnerID = "player_9"
	p1.Version = 2
	if err := store.SaveRoomState("room-legacy", sheets, nil); err != nil {
		t.Fatalf("Erro ao salvar sala migrada: %v", err)
	}

	reloaded, _, err := store.LoadRoomState("room-legacy")
	if err != nil {
		t.Fatalf("Erro ao recarregar sala migrada: %v", err)
	}
	if reloaded["pilot-1"].OwnerID != "player_9" {
		t.Fatalf("Esperava OwnerID player_9 após migração, obteve %q", reloaded["pilot-1"].OwnerID)
	}
}
