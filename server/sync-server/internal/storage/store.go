package storage

import (
	"encoding/json"

	"compcon-sync-server/internal/models"
)

// Store define o contrato de persistência para as salas e fichas do servidor.
type Store interface {
	// SaveRoomState grava o estado consolidado da sala (fichas e tracker ativo).
	SaveRoomState(roomID string, sheets map[string]*models.SheetStateEntry, tracker json.RawMessage) error

	// LoadRoomState recupera o estado salvo de uma sala ao ser reaberta.
	LoadRoomState(roomID string) (map[string]*models.SheetStateEntry, json.RawMessage, error)

	// Close encerra as conexões do banco de dados graciosamente.
	Close() error
}
