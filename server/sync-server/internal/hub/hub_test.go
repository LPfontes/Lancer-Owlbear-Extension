package hub

import (
	"encoding/json"
	"testing"
	"time"

	"compcon-sync-server/internal/config"
	"compcon-sync-server/internal/models"
)

func newTestConfig() *config.Config {
	return &config.Config{
		Port:           "8080",
		DataDir:        "./test_data",
		WriteWait:      1 * time.Second,
		PongWait:       2 * time.Second,
		PingPeriod:     1 * time.Second,
		MaxMessageSize: 512 * 1024,
		DebounceDelay:  50 * time.Millisecond,
	}
}

func TestRoomManagerAndHub(t *testing.T) {
	cfg := newTestConfig()
	mgr := NewRoomManager(cfg)
	defer mgr.CloseAll()

	roomID := "room-alpha"
	hub := mgr.GetOrCreateRoom(roomID)

	if hub == nil {
		t.Fatal("Esperava hub criado, obteve nil")
	}

	// Recuperar a mesma sala deve retornar a mesma instância
	hub2 := mgr.GetOrCreateRoom(roomID)
	if hub != hub2 {
		t.Fatal("Instâncias de RoomHub para a mesma sala devem ser idênticas")
	}

	if mgr.RoomCount() != 1 {
		t.Fatalf("Esperava 1 sala, obteve %d", mgr.RoomCount())
	}
}

func TestHubPilotJoinAndBroadcast(t *testing.T) {
	cfg := newTestConfig()
	hub := NewRoomHub("test-room", cfg)
	go hub.Run()
	defer hub.Stop()

	// Simula dois clientes (Jogador e GM)
	playerClient := &Client{
		Hub:    hub,
		Send:   make(chan []byte, 10),
		ID:     "player_1",
		Role:   "PLAYER",
		RoomID: "test-room",
		cfg:    cfg,
	}

	gmClient := &Client{
		Hub:    hub,
		Send:   make(chan []byte, 10),
		ID:     "gm_1",
		Role:   "GM",
		RoomID: "test-room",
		cfg:    cfg,
	}

	// Registra Jogador
	hub.Register <- playerClient
	time.Sleep(20 * time.Millisecond)

	// Jogador deve ter recebido INIT_SYNC
	select {
	case msg := <-playerClient.Send:
		var env models.SyncEnvelope
		if err := json.Unmarshal(msg, &env); err != nil {
			t.Fatalf("Erro ao ler INIT_SYNC: %v", err)
		}
		if env.Type != models.TypeInitSync {
			t.Fatalf("Esperava tipo INIT_SYNC, obteve %s", env.Type)
		}
	default:
		t.Fatal("Jogador não recebeu INIT_SYNC após registrar")
	}

	// Registra GM
	hub.Register <- gmClient
	time.Sleep(20 * time.Millisecond)

	// Jogador deve receber notificação GM_ONLINE
	select {
	case msg := <-playerClient.Send:
		var env models.SyncEnvelope
		_ = json.Unmarshal(msg, &env)
		if env.Type != models.TypeGmOnline {
			t.Fatalf("Esperava GM_ONLINE no jogador, obteve %s", env.Type)
		}
	default:
		t.Fatal("Jogador não recebeu notificação de GM_ONLINE")
	}

	// Limpa fila do GM (que recebeu INIT_SYNC)
	<-gmClient.Send

	// Jogador dispara PILOT_JOIN_COMBAT
	pilotPayload := models.PilotJoinCombatPayload{
		PilotID:   "pilot-99",
		PilotData: json.RawMessage(`{"callsign":"SPECTER","stats":{"current":{"hp":15}}}`),
		Version:   1,
	}
	rawPayload, _ := json.Marshal(pilotPayload)

	joinEnv := &models.SyncEnvelope{
		Type:      models.TypePilotJoinCombat,
		RoomID:    "test-room",
		SenderID:  "player_1",
		Timestamp: time.Now().UnixMilli(),
		Payload:   rawPayload,
	}

	hub.Incoming <- joinEnv
	time.Sleep(20 * time.Millisecond)

	// 1. O GM DEVE receber a mensagem (broadcast)
	select {
	case msg := <-gmClient.Send:
		var env models.SyncEnvelope
		_ = json.Unmarshal(msg, &env)
		if env.Type != models.TypePilotJoinCombat {
			t.Fatalf("GM esperava PILOT_JOIN_COMBAT, obteve %s", env.Type)
		}
	default:
		t.Fatal("GM não recebeu o broadcast de PILOT_JOIN_COMBAT")
	}

	// 2. O Jogador NÃO deve receber eco de sua própria mensagem
	select {
	case msg := <-playerClient.Send:
		t.Fatalf("Jogador recebeu eco indevido: %s", string(msg))
	default:
		// Correto: sem eco
	}

	// 3. O estado em memória da sala deve conter o piloto com inCombat = true
	hub.mu.RLock()
	sheet, exists := hub.Sheets["pilot-99"]
	hub.mu.RUnlock()

	if !exists {
		t.Fatal("Ficha pilot-99 não foi inserida na memória do hub")
	}
	if !sheet.InCombat {
		t.Fatal("Esperava InCombat = true")
	}
	if sheet.OwnerID != "player_1" {
		t.Fatalf("Esperava OwnerID = player_1 (quem anunciou a ficha), obteve %q", sheet.OwnerID)
	}

	// 4. Aplica um PATCH_FIELD
	patchPayload := models.PatchFieldPayload{
		CharacterID:   "pilot-99",
		CharacterType: "pilot",
		Field:         "stats.current.hp",
		Value:         11,
		Version:       2,
	}
	rawPatch, _ := json.Marshal(patchPayload)

	patchEnv := &models.SyncEnvelope{
		Type:      models.TypePatchField,
		RoomID:    "test-room",
		SenderID:  "player_1",
		Timestamp: time.Now().UnixMilli(),
		Payload:   rawPatch,
	}

	hub.Incoming <- patchEnv
	time.Sleep(20 * time.Millisecond)

	hub.mu.RLock()
	updatedSheet := hub.Sheets["pilot-99"]
	hub.mu.RUnlock()

	if updatedSheet.Version != 2 {
		t.Fatalf("Esperava versão 2 após patch, obteve %d", updatedSheet.Version)
	}

	var parsedData map[string]interface{}
	_ = json.Unmarshal(updatedSheet.Data, &parsedData)
	hp := parsedData["stats"].(map[string]interface{})["current"].(map[string]interface{})["hp"]
	if hp != float64(11) {
		t.Fatalf("Esperava hp atualizado para 11, obteve %v", hp)
	}
}

// expectNextEnvelope consome o próximo envelope da fila do cliente, falhando se nada chegar.
func expectNextEnvelope(t *testing.T, client *Client, context string) models.SyncEnvelope {
	t.Helper()

	select {
	case msg := <-client.Send:
		var env models.SyncEnvelope
		if err := json.Unmarshal(msg, &env); err != nil {
			t.Fatalf("%s: erro ao ler envelope: %v", context, err)
		}
		return env
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("%s: nenhum envelope recebido", context)
		return models.SyncEnvelope{}
	}
}

// TestActiveSheetDeliveredToOwnerOnReconnect garante que o dono da ficha ativa a
// recebe de volta ao conectar, e que os demais clientes não recebem nada dirigido.
func TestActiveSheetDeliveredToOwnerOnReconnect(t *testing.T) {
	cfg := newTestConfig()
	hub := NewRoomHub("test-room", cfg)
	go hub.Run()
	defer hub.Stop()

	// O jogador anuncia a ficha ativa dele
	pilotPayload, _ := json.Marshal(models.PilotJoinCombatPayload{
		PilotID:   "pilot-42",
		PilotData: json.RawMessage(`{"callsign":"ROOK","stats":{"current":{"hp":12}}}`),
		Version:   3,
	})
	hub.Incoming <- &models.SyncEnvelope{
		Type:      models.TypePilotJoinCombat,
		RoomID:    "test-room",
		SenderID:  "player_7",
		Timestamp: time.Now().UnixMilli(),
		Payload:   pilotPayload,
	}

	// Um NPC da sala nunca é "ficha ativa" de ninguém
	npcPayload, _ := json.Marshal(models.FullSheetPayload{
		CharacterID:   "npc-1",
		CharacterType: "npc",
		Data:          json.RawMessage(`{"name":"Assault #1"}`),
		Version:       1,
	})
	hub.Incoming <- &models.SyncEnvelope{
		Type:      models.TypeSyncFullSheet,
		RoomID:    "test-room",
		SenderID:  "gm_1",
		Timestamp: time.Now().UnixMilli(),
		Payload:   npcPayload,
	}
	time.Sleep(30 * time.Millisecond)

	// 1. O dono reconecta: recebe INIT_SYNC e, em seguida, a ficha ativa dele
	owner := &Client{Hub: hub, Send: make(chan []byte, 10), ID: "player_7", Role: "PLAYER", RoomID: "test-room", cfg: cfg}
	hub.Register <- owner
	time.Sleep(30 * time.Millisecond)

	if env := expectNextEnvelope(t, owner, "dono: INIT_SYNC"); env.Type != models.TypeInitSync {
		t.Fatalf("Dono esperava INIT_SYNC primeiro, obteve %s", env.Type)
	}

	activeEnv := expectNextEnvelope(t, owner, "dono: ficha ativa")
	if activeEnv.Type != models.TypeSyncFullSheet {
		t.Fatalf("Dono esperava SYNC_FULL_SHEET com a ficha ativa, obteve %s", activeEnv.Type)
	}
	if activeEnv.SenderID != "server" {
		t.Fatalf("Ficha ativa deveria vir do servidor, veio de %q", activeEnv.SenderID)
	}

	var active models.FullSheetPayload
	if err := json.Unmarshal(activeEnv.Payload, &active); err != nil {
		t.Fatalf("Erro ao ler payload da ficha ativa: %v", err)
	}
	if active.CharacterID != "pilot-42" || active.CharacterType != "pilot" {
		t.Fatalf("Ficha ativa incorreta: %s (%s)", active.CharacterID, active.CharacterType)
	}
	if active.Version != 3 {
		t.Fatalf("Esperava versão 3 na ficha ativa, obteve %d", active.Version)
	}

	var pilotData map[string]interface{}
	if err := json.Unmarshal(active.Data, &pilotData); err != nil {
		t.Fatalf("Erro ao ler dados da ficha ativa: %v", err)
	}
	if pilotData["callsign"] != "ROOK" {
		t.Fatalf("Esperava callsign ROOK, obteve %v", pilotData["callsign"])
	}

	// 2. Um jogador sem ficha na sala recebe apenas o INIT_SYNC
	stranger := &Client{Hub: hub, Send: make(chan []byte, 10), ID: "player_99", Role: "PLAYER", RoomID: "test-room", cfg: cfg}
	hub.Register <- stranger
	time.Sleep(30 * time.Millisecond)

	if env := expectNextEnvelope(t, stranger, "estranho: INIT_SYNC"); env.Type != models.TypeInitSync {
		t.Fatalf("Estranho esperava INIT_SYNC, obteve %s", env.Type)
	}
	select {
	case msg := <-stranger.Send:
		t.Fatalf("Estranho não deveria receber ficha ativa de outro jogador: %s", string(msg))
	case <-time.After(50 * time.Millisecond):
	}
}

// TestSyncFullSheetKeepsKnownOwner garante que o reenvio do roster por outra
// janela (inclusive o GM) não rouba a posse da ficha do jogador.
// TestActiveSheetDeliveredToEveryWindowOfTheOwner garante que a ficha ativa dirigida
// chega nas duas janelas do jogador (popover da ficha + painel de ações/chat).
func TestActiveSheetDeliveredToEveryWindowOfTheOwner(t *testing.T) {
	cfg := newTestConfig()
	hub := NewRoomHub("test-room", cfg)
	go hub.Run()
	defer hub.Stop()

	pilotPayload, _ := json.Marshal(models.PilotJoinCombatPayload{
		PilotID:   "pilot-77",
		PilotData: json.RawMessage(`{"callsign":"TWIN"}`),
		Version:   1,
	})
	hub.Incoming <- &models.SyncEnvelope{
		Type:      models.TypePilotJoinCombat,
		RoomID:    "test-room",
		SenderID:  "player_5",
		Timestamp: time.Now().UnixMilli(),
		Payload:   pilotPayload,
	}
	time.Sleep(30 * time.Millisecond)

	// Duas conexões do MESMO jogador: a segunda janela não pode "roubar" a entrega.
	sheetWindow := &Client{Hub: hub, Send: make(chan []byte, 10), ID: "player_5", Role: "PLAYER", RoomID: "test-room", cfg: cfg}
	hub.Register <- sheetWindow
	time.Sleep(20 * time.Millisecond)
	// Consome o INIT_SYNC e a ficha ativa da primeira janela
	<-sheetWindow.Send
	<-sheetWindow.Send

	chatWindow := &Client{Hub: hub, Send: make(chan []byte, 10), ID: "player_5", Role: "PLAYER", RoomID: "test-room", cfg: cfg}
	hub.Register <- chatWindow
	time.Sleep(30 * time.Millisecond)

	// INIT_SYNC da segunda janela; a ficha ativa dirigida vem em seguida.
	<-chatWindow.Send

	env := expectNextEnvelope(t, chatWindow, "painel de chat: ficha ativa")
	if env.Type != models.TypeSyncFullSheet {
		t.Fatalf("Painel de chat esperava SYNC_FULL_SHEET, obteve %s", env.Type)
	}

	var active models.FullSheetPayload
	if err := json.Unmarshal(env.Payload, &active); err != nil {
		t.Fatalf("Erro ao ler payload: %v", err)
	}
	if active.CharacterID != "pilot-77" {
		t.Fatalf("Esperava pilot-77, obteve %s", active.CharacterID)
	}
}

func TestSyncFullSheetKeepsKnownOwner(t *testing.T) {
	cfg := newTestConfig()
	hub := NewRoomHub("test-room", cfg)
	go hub.Run()
	defer hub.Stop()

	pilotPayload, _ := json.Marshal(models.PilotJoinCombatPayload{
		PilotID:   "pilot-42",
		PilotData: json.RawMessage(`{"callsign":"ROOK"}`),
		SheetID:   "sheet-42",
		Version:   1,
	})
	hub.Incoming <- &models.SyncEnvelope{
		Type:      models.TypePilotJoinCombat,
		RoomID:    "test-room",
		SenderID:  "player_7",
		Timestamp: time.Now().UnixMilli(),
		Payload:   pilotPayload,
	}
	time.Sleep(30 * time.Millisecond)

	fullPayload, _ := json.Marshal(models.FullSheetPayload{
		CharacterID:   "pilot-42",
		CharacterType: "pilot",
		Data:          json.RawMessage(`{"callsign":"ROOK","stats":{"current":{"hp":9}}}`),
		Version:       2,
	})
	hub.Incoming <- &models.SyncEnvelope{
		Type:      models.TypeSyncFullSheet,
		RoomID:    "test-room",
		SenderID:  "gm_1",
		Timestamp: time.Now().UnixMilli() + 1000,
		Payload:   fullPayload,
	}
	time.Sleep(30 * time.Millisecond)

	hub.mu.RLock()
	sheet := hub.Sheets["pilot-42"]
	hub.mu.RUnlock()

	if sheet == nil {
		t.Fatal("Ficha pilot-42 não encontrada após SYNC_FULL_SHEET")
	}
	if sheet.OwnerID != "player_7" {
		t.Fatalf("GM não deveria assumir a posse da ficha; OwnerID = %q", sheet.OwnerID)
	}
	if sheet.SheetID != "sheet-42" {
		t.Fatalf("O container da ficha deveria sobreviver ao SYNC_FULL_SHEET; SheetID = %q", sheet.SheetID)
	}
	if !sheet.InCombat {
		t.Fatal("SYNC_FULL_SHEET não deveria limpar InCombat")
	}
	if sheet.Version != 2 {
		t.Fatalf("Esperava versão 2 após SYNC_FULL_SHEET, obteve %d", sheet.Version)
	}
}

func TestHubEndEncounterAndClearTracker(t *testing.T) {
	cfg := newTestConfig()
	hub := NewRoomHub("test-room-encounter", cfg)
	go hub.Run()
	defer hub.Stop()

	playerClient := &Client{
		Hub:    hub,
		Send:   make(chan []byte, 10),
		ID:     "player_1",
		Role:   "PLAYER",
		RoomID: "test-room-encounter",
		cfg:    cfg,
	}
	hub.Register <- playerClient
	time.Sleep(20 * time.Millisecond)
	// Consome INIT_SYNC
	<-playerClient.Send

	// Adiciona piloto em combate, NPC e tracker ativo
	hub.mu.Lock()
	hub.Sheets["pilot-1"] = &models.SheetStateEntry{
		CharacterID:   "pilot-1",
		CharacterType: "pilot",
		InCombat:      true,
		Data:          json.RawMessage(`{"callsign":"ACE"}`),
	}
	hub.Sheets["npc-1"] = &models.SheetStateEntry{
		CharacterID:   "npc-1",
		CharacterType: "npc",
		InCombat:      true,
		Data:          json.RawMessage(`{"name":"Assault"}`),
	}
	hub.ActiveTracker = json.RawMessage(`{"round":2,"turn":1}`)
	hub.mu.Unlock()

	// Envia sinal END_ENCOUNTER via Incoming (simulando WebSocket do GM)
	payloadRaw, _ := json.Marshal(models.EndEncounterPayload{
		EncounterID: "enc-99",
		Reason:      "victory",
	})
	hub.Incoming <- &models.SyncEnvelope{
		Type:      models.TypeEndEncounter,
		RoomID:    "test-room-encounter",
		SenderID:  "gm_1",
		Timestamp: time.Now().UnixMilli(),
		Payload:   payloadRaw,
	}
	time.Sleep(50 * time.Millisecond)

	hub.mu.RLock()
	tracker := hub.ActiveTracker
	pilot := hub.Sheets["pilot-1"]
	npc := hub.Sheets["npc-1"]
	hub.mu.RUnlock()

	if tracker != nil {
		t.Fatalf("Esperava ActiveTracker limpo (nil), obteve: %s", string(tracker))
	}
	if npc != nil {
		t.Fatalf("Esperava NPC removido das sheets da sala, mas ainda existe: %+v", npc)
	}
	if pilot == nil {
		t.Fatal("Piloto não deveria ser deletado ao encerrar o encontro")
	}
	if pilot.InCombat {
		t.Fatal("Esperava pilot.InCombat = false após encerramento do encontro")
	}

	// Jogador deve ter recebido o envelope END_ENCOUNTER
	select {
	case msg := <-playerClient.Send:
		var env models.SyncEnvelope
		if err := json.Unmarshal(msg, &env); err != nil {
			t.Fatalf("Erro ao deserializar envelope recebido: %v", err)
		}
		if env.Type != models.TypeEndEncounter {
			t.Fatalf("Esperava envelope do tipo END_ENCOUNTER, obteve %s", env.Type)
		}
	default:
		t.Fatal("Jogador conectado não recebeu o broadcast END_ENCOUNTER")
	}
}

