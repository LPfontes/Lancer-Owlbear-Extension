package models

import "encoding/json"

// MessageType define os tipos de mensagens suportados pelo protocolo.
type MessageType string

const (
	TypeInitSync        MessageType = "INIT_SYNC"
	TypePilotJoinCombat MessageType = "PILOT_JOIN_COMBAT"
	TypePatchField      MessageType = "PATCH_FIELD"
	TypeSyncFullSheet   MessageType = "SYNC_FULL_SHEET"
	TypeRemoveSheet     MessageType = "REMOVE_SHEET"
	TypeTableAction     MessageType = "TABLE_ACTION"
	TypeTrackerSync     MessageType = "TRACKER_SYNC"
	TypeTrackerClear    MessageType = "TRACKER_CLEAR"
	TypeEndEncounter    MessageType = "END_ENCOUNTER"
	TypeGmOnline        MessageType = "GM_ONLINE"
	TypePing            MessageType = "PING"
	TypePong            MessageType = "PONG"
)

// EndEncounterPayload carrega informações opcionais sobre o encerramento do encontro.
type EndEncounterPayload struct {
	EncounterID string `json:"encounterId,omitempty"`
	Reason      string `json:"reason,omitempty"`
}

// SyncEnvelope representa o envelope padrão trafegado no WebSocket.
type SyncEnvelope struct {
	Type      MessageType     `json:"type"`
	RoomID    string          `json:"roomId"`
	SenderID  string          `json:"senderId"`
	Timestamp int64           `json:"timestamp"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

// PilotJoinCombatPayload carrega a ficha completa no momento de entrar em combate.
type PilotJoinCombatPayload struct {
	PilotID      string          `json:"pilotId"`
	PilotData    json.RawMessage `json:"pilotData"`
	ActiveMechID string          `json:"activeMechId,omitempty"`
	SheetID      string          `json:"sheetId,omitempty"`
	Version      int64           `json:"version"`
}

// PatchFieldPayload representa a mutação de um campo específico com dot-notation.
type PatchFieldPayload struct {
	CharacterID   string      `json:"characterId"`
	CharacterType string      `json:"characterType"` // "pilot" ou "npc"
	Field         string      `json:"field"`         // ex: "stats.current.hp" ou "mechs.0.combat_data.stats.current.hp"
	Value         interface{} `json:"value"`
	Version       int64       `json:"version"`
}

// FullSheetPayload carrega uma ficha completa (piloto ou NPC) para atualização de Hangar.
type FullSheetPayload struct {
	CharacterID   string          `json:"characterId"`
	CharacterType string          `json:"characterType"`
	Data          json.RawMessage `json:"data"`
	Version       int64           `json:"version"`
}

// RemoveSheetPayload instrui a remoção de uma ficha da sala.
type RemoveSheetPayload struct {
	CharacterID   string `json:"characterId"`
	CharacterType string `json:"characterType"`
}

// SheetStateEntry representa uma ficha armazenada em memória na sala.
type SheetStateEntry struct {
	CharacterID   string          `json:"characterId"`
	CharacterType string          `json:"characterType"`
	Data          json.RawMessage `json:"data"`
	InCombat      bool            `json:"inCombat"`
	Version       int64           `json:"version"`
	UpdatedAt     int64           `json:"updatedAt"`
	// OwnerID é o playerId que anunciou a própria ficha na sala (normalmente via
	// PILOT_JOIN_COMBAT). É o vínculo usado para devolver a ficha ativa ao dono
	// quando ele reconecta.
	OwnerID string `json:"ownerId,omitempty"`
	// SheetID é o id do container de ficha do Modo Ativo (o id da rota
	// `pilot-runner/:id`). A sala guarda o dado do piloto, não o container: sem este
	// campo uma janela que só conhece o id da ficha não consegue pedir a cópia certa.
	SheetID string `json:"sheetId,omitempty"`
}

// InitSyncPayload é o snapshot entregue ao cliente assim que ele se conecta.
type InitSyncPayload struct {
	RoomID        string                      `json:"roomId"`
	Sheets        map[string]*SheetStateEntry `json:"sheets"`
	ActiveTracker json.RawMessage             `json:"activeTracker,omitempty"`
	GMConnected   bool                        `json:"gmConnected"`
}
