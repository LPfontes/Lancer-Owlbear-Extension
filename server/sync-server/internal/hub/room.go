package hub

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"compcon-sync-server/internal/config"
	"compcon-sync-server/internal/models"
)

// RoomHub gerencia os clientes e o estado compartilhado de uma sala isolada.
type RoomHub struct {
	RoomID        string
	Clients       map[*Client]bool
	Sheets        map[string]*models.SheetStateEntry
	ActiveTracker json.RawMessage

	Register    chan *Client
	Unregister  chan *Client
	Incoming    chan *models.SyncEnvelope
	DirtySignal chan struct{}
	stopChan    chan struct{}

	mu  sync.RWMutex
	cfg *config.Config

	// PersistFn é o hook assíncrono para gravação em disco (configurado no Passo 2)
	PersistFn func(roomID string, sheets map[string]*models.SheetStateEntry, tracker json.RawMessage) error
}

// NewRoomHub cria uma nova instância de sala.
func NewRoomHub(roomID string, cfg *config.Config) *RoomHub {
	return &RoomHub{
		RoomID:      roomID,
		Clients:     make(map[*Client]bool),
		Sheets:      make(map[string]*models.SheetStateEntry),
		Register:    make(chan *Client),
		Unregister:  make(chan *Client),
		Incoming:    make(chan *models.SyncEnvelope, 1024),
		DirtySignal: make(chan struct{}, 1),
		stopChan:    make(chan struct{}),
		cfg:         cfg,
	}
}

// HasGM verifica se há algum cliente com papel de GM conectado na sala.
func (r *RoomHub) HasGM() bool {
	for client := range r.Clients {
		if client.Role == "GM" {
			return true
		}
	}
	return false
}

// ClientCount retorna o número de conexões ativas na sala.
func (r *RoomHub) ClientCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.Clients)
}

// Run executa o loop principal da sala em uma goroutine isolada.
func (r *RoomHub) Run() {
	go r.debouncePersistLoop()

	for {
		select {
		case client := <-r.Register:
			r.mu.Lock()
			r.Clients[client] = true
			isGM := client.Role == "GM"
			r.mu.Unlock()

			log.Printf("[Room %s] Cliente registrado: ID=%s, Role=%s (Total: %d)", r.RoomID, client.ID, client.Role, len(r.Clients))

			// Se o GM acabou de se conectar, notifica a sala inteira (Salvaguarda Camada 3)
			if isGM {
				r.broadcastEnvelope(&models.SyncEnvelope{
					Type:      models.TypeGmOnline,
					RoomID:    r.RoomID,
					SenderID:  client.ID,
					Timestamp: time.Now().UnixMilli(),
				}, client.ID)
			}

			// Envia snapshot INIT_SYNC individualmente para o cliente recém-conectado
			r.sendInitSync(client)

			// Devolve ao dono os dados da ficha ativa dele, se ela existir na sala
			r.sendActiveSheet(client)

		case client := <-r.Unregister:
			r.mu.Lock()
			if _, ok := r.Clients[client]; ok {
				delete(r.Clients, client)
				close(client.Send)
				log.Printf("[Room %s] Cliente desconectado: ID=%s (Restantes: %d)", r.RoomID, client.ID, len(r.Clients))
			}
			r.mu.Unlock()

		case env := <-r.Incoming:
			r.handleIncomingEnvelope(env)

		case <-r.stopChan:
			return
		}
	}
}

// Stop encerra a goroutine da sala.
func (r *RoomHub) Stop() {
	close(r.stopChan)
}

// sendInitSync monta e entrega o estado consolidado da sala para o cliente.
func (r *RoomHub) sendInitSync(client *Client) {
	r.mu.RLock()
	sheetsCopy := make(map[string]*models.SheetStateEntry, len(r.Sheets))
	for k, v := range r.Sheets {
		sheetsCopy[k] = v
	}
	trackerCopy := r.ActiveTracker
	gmConnected := r.HasGM()
	r.mu.RUnlock()

	initPayload := models.InitSyncPayload{
		RoomID:        r.RoomID,
		Sheets:        sheetsCopy,
		ActiveTracker: trackerCopy,
		GMConnected:   gmConnected,
	}

	payloadRaw, err := json.Marshal(initPayload)
	if err != nil {
		log.Printf("[Room %s] Erro ao serializar INIT_SYNC: %v", r.RoomID, err)
		return
	}

	env := &models.SyncEnvelope{
		Type:      models.TypeInitSync,
		RoomID:    r.RoomID,
		SenderID:  "server",
		Timestamp: time.Now().UnixMilli(),
		Payload:   payloadRaw,
	}

	client.SendEnvelope(env)
}

// sendActiveSheet entrega ao cliente que acabou de conectar os dados da ficha ativa
// dele, quando ela existir no estado da sala.
//
// "Ficha ativa" é a ficha de piloto que o próprio jogador anunciou ao entrar em
// combate (PILOT_JOIN_COMBAT): é o único momento em que um cliente declara
// explicitamente qual ficha está jogando, e é o vínculo gravado em
// SheetStateEntry.OwnerID. Se o jogador não tiver ficha ativa na sala, nada é
// enviado — o INIT_SYNC já entregou o restante do estado.
//
// A entrega é um SYNC_FULL_SHEET dirigido ao dono, então os demais clientes não
// recebem nada extra (nada de broadcast/eco).
func (r *RoomHub) sendActiveSheet(client *Client) {
	if client == nil || client.ID == "" {
		return
	}

	r.mu.RLock()
	var active *models.SheetStateEntry
	for _, sheet := range r.Sheets {
		if sheet == nil || sheet.OwnerID != client.ID || sheet.CharacterType != "pilot" || !sheet.InCombat {
			continue
		}
		if len(sheet.Data) == 0 {
			continue
		}
		// Um jogador pode ter mais de uma ficha anunciada na sala; a mais recente
		// é a que representa a ficha ativa dele agora.
		if active == nil || sheet.UpdatedAt > active.UpdatedAt {
			active = sheet
		}
	}
	// Cópia rasa antes de soltar o lock: a sala pode mutar a ficha durante a serialização.
	var snapshot models.SheetStateEntry
	if active != nil {
		snapshot = *active
	}
	r.mu.RUnlock()

	if active == nil {
		return
	}

	payload, err := json.Marshal(models.FullSheetPayload{
		CharacterID:   snapshot.CharacterID,
		CharacterType: snapshot.CharacterType,
		Data:          snapshot.Data,
		Version:       snapshot.Version,
	})
	if err != nil {
		log.Printf("[Room %s] Erro ao serializar ficha ativa de %s: %v", r.RoomID, client.ID, err)
		return
	}

	log.Printf("[Room %s] Enviando ficha ativa %q (v%d) para o jogador %s", r.RoomID, snapshot.CharacterID, snapshot.Version, client.ID)

	client.SendEnvelope(&models.SyncEnvelope{
		Type:      models.TypeSyncFullSheet,
		RoomID:    r.RoomID,
		SenderID:  "server",
		Timestamp: time.Now().UnixMilli(),
		Payload:   payload,
	})
}

// handleIncomingEnvelope processa mutações de estado e faz o broadcast para os demais clientes.
func (r *RoomHub) handleIncomingEnvelope(env *models.SyncEnvelope) {
	r.mu.Lock()

	switch env.Type {
	case models.TypePilotJoinCombat:
		var payload models.PilotJoinCombatPayload
		if err := json.Unmarshal(env.Payload, &payload); err == nil && payload.PilotID != "" {
			r.Sheets[payload.PilotID] = &models.SheetStateEntry{
				CharacterID:   payload.PilotID,
				CharacterType: "pilot",
				Data:          payload.PilotData,
				InCombat:      true,
				Version:       payload.Version,
				UpdatedAt:     env.Timestamp,
				// Quem anuncia a própria entrada em combate é o dono da ficha ativa.
				OwnerID: env.SenderID,
				// O container da ficha (rota `pilot-runner/:id`) só vem neste payload:
				// guardá-lo permite atender um pedido feito só com o id da ficha.
				SheetID: payload.SheetID,
			}
			r.markDirty()
			log.Printf("[Room %s] Piloto entrou em combate: %s (v%d)", r.RoomID, payload.PilotID, payload.Version)
		}

	case models.TypePatchField:
		var payload models.PatchFieldPayload
		if err := json.Unmarshal(env.Payload, &payload); err == nil && payload.CharacterID != "" {
			if existing, exists := r.Sheets[payload.CharacterID]; exists {
				// Resolução de conflitos LWW: aceita se version for maior ou igual.
				//
				// Exceção: caminhos de STAT (`stats.current.*`) são EVENTOS — dano, calor,
				// estrutura aplicados pelo Combat Tracker. Uma janela que não recebe os
				// patches das outras janelas do mesmo jogador fica com a versão atrasada e o
				// dano era descartado em silêncio (a ficha do jogador não mudava). Para
				// esses caminhos a última chegada vence, e a versão guardada nunca regride.
				isStatPath := models.IsStatPath(payload.Field)
				if payload.Version >= existing.Version || isStatPath {
					updatedData, err := models.ApplyPatchToRawJSON(existing.Data, payload.Field, payload.Value)
					if err == nil {
						existing.Data = updatedData
						if payload.Version > existing.Version {
							existing.Version = payload.Version
						}
						existing.UpdatedAt = env.Timestamp
						r.markDirty()
					} else {
						log.Printf("[Room %s] Erro ao aplicar patch em %s: %v", r.RoomID, payload.Field, err)
					}
				}
			}
		}

	case models.TypeSyncFullSheet:
		var payload models.FullSheetPayload
		if err := json.Unmarshal(env.Payload, &payload); err == nil && payload.CharacterID != "" {
			inCombat := false
			ownerID := ""
			sheetID := ""
			if existing, ok := r.Sheets[payload.CharacterID]; ok {
				inCombat = existing.InCombat
				ownerID = existing.OwnerID
				sheetID = existing.SheetID
			}
			// Qualquer janela da mesa reenvia o roster inteiro (`broadcastAllLocalPilots`),
			// então a posse já conhecida é preservada; ela só muda em PILOT_JOIN_COMBAT,
			// onde o próprio jogador assume a ficha como ativa.
			if ownerID == "" {
				ownerID = env.SenderID
			}
			// O container da ficha não vem neste payload: preserva o que já foi anunciado.
			r.Sheets[payload.CharacterID] = &models.SheetStateEntry{
				CharacterID:   payload.CharacterID,
				CharacterType: payload.CharacterType,
				Data:          payload.Data,
				InCombat:      inCombat,
				Version:       payload.Version,
				UpdatedAt:     env.Timestamp,
				OwnerID:       ownerID,
				SheetID:       sheetID,
			}
			r.markDirty()
		}

	case models.TypeRemoveSheet:
		var payload models.RemoveSheetPayload
		if err := json.Unmarshal(env.Payload, &payload); err == nil && payload.CharacterID != "" {
			delete(r.Sheets, payload.CharacterID)
			r.markDirty()
		}

	case models.TypeTrackerSync:
		r.ActiveTracker = env.Payload
		r.markDirty()

	case models.TypeTrackerClear:
		r.ActiveTracker = nil
		r.markDirty()
		log.Printf("[Room %s] Tracker de iniciativa limpo por %s", r.RoomID, env.SenderID)

	case models.TypeEndEncounter:
		r.endEncounterLocked(env.SenderID)

	case models.TypePing:
		r.mu.Unlock()
		// Responde pong apenas para o remetente
		r.sendDirect(env.SenderID, &models.SyncEnvelope{
			Type:      models.TypePong,
			RoomID:    r.RoomID,
			SenderID:  "server",
			Timestamp: time.Now().UnixMilli(),
		})
		return
	}

	r.mu.Unlock()

	// Broadcast para todos os clientes da sala, ignorando o remetente original (filtro de eco)
	r.broadcastEnvelope(env, env.SenderID)
}

// broadcastEnvelope entrega a mensagem a todos os clientes conectados, exceto exceptSenderID.
func (r *RoomHub) broadcastEnvelope(env *models.SyncEnvelope, exceptSenderID string) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	data, err := json.Marshal(env)
	if err != nil {
		log.Printf("[Room %s] Erro ao serializar broadcast: %v", r.RoomID, err)
		return
	}

	for client := range r.Clients {
		if client.ID == exceptSenderID {
			continue // Evita eco para quem originou a ação
		}
		select {
		case client.Send <- data:
		default:
			log.Printf("[Room %s] Buffer do cliente %s cheio, mensagem ignorada", r.RoomID, client.ID)
		}
	}
}

// sendDirect entrega uma mensagem a TODOS os clientes do jogador informado.
//
// A mesma pessoa pode ter mais de uma janela conectada — o popover da ficha e o painel
// de ações/chat (que roda em somente-leitura). Entregar só para o primeiro cliente do
// `map` tornava a ficha ativa dirigida uma loteria entre as duas janelas.
func (r *RoomHub) sendDirect(clientID string, env *models.SyncEnvelope) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for client := range r.Clients {
		if client.ID == clientID {
			client.SendEnvelope(env)
		}
	}
}

// markDirty sinaliza que houve mutações pendentes de persistência em disco.
func (r *RoomHub) markDirty() {
	select {
	case r.DirtySignal <- struct{}{}:
	default:
		// Já há um sinal pendente
	}
}

// debouncePersistLoop agrupa escritas em lote com um timer de debounce.
func (r *RoomHub) debouncePersistLoop() {
	var timer *time.Timer
	var timerCh <-chan time.Time

	for {
		select {
		case <-r.DirtySignal:
			if timer == nil {
				timer = time.NewTimer(r.cfg.DebounceDelay)
				timerCh = timer.C
			} else {
				timer.Reset(r.cfg.DebounceDelay)
			}
		case <-timerCh:
			timer = nil
			timerCh = nil
			r.flushToStorage()
		case <-r.stopChan:
			r.flushToStorage()
			return
		}
	}
}

func (r *RoomHub) flushToStorage() {
	if r.PersistFn == nil {
		return
	}
	r.mu.RLock()
	sheetsCopy := make(map[string]*models.SheetStateEntry, len(r.Sheets))
	for k, v := range r.Sheets {
		sheetsCopy[k] = v
	}
	trackerCopy := r.ActiveTracker
	r.mu.RUnlock()

	if err := r.PersistFn(r.RoomID, sheetsCopy, trackerCopy); err != nil {
		log.Printf("[Room %s] Erro no flush de persistência: %v", r.RoomID, err)
	}
}

// endEncounterLocked executa o encerramento do encontro e limpeza de iniciativa, assumindo que r.mu já está bloqueado.
func (r *RoomHub) endEncounterLocked(senderID string) {
	r.ActiveTracker = nil
	for id, sheet := range r.Sheets {
		if sheet.CharacterType == "npc" {
			delete(r.Sheets, id)
		} else if sheet.CharacterType == "pilot" {
			sheet.InCombat = false
		}
	}
	r.markDirty()
	log.Printf("[Room %s] Encontro encerrado e tracker de iniciativa limpo (origem: %s)", r.RoomID, senderID)
}

// EndEncounter encerra o encontro de forma segura com lock r.mu.
func (r *RoomHub) EndEncounter(senderID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.endEncounterLocked(senderID)
}

// EndEncounterAndBroadcast encerra o encontro e transmite o sinal para todos os clientes conectados na sala.
func (r *RoomHub) EndEncounterAndBroadcast(senderID string, payload *models.EndEncounterPayload) {
	r.EndEncounter(senderID)

	var payloadRaw json.RawMessage
	if payload != nil {
		payloadRaw, _ = json.Marshal(payload)
	}

	env := &models.SyncEnvelope{
		Type:      models.TypeEndEncounter,
		RoomID:    r.RoomID,
		SenderID:  senderID,
		Timestamp: time.Now().UnixMilli(),
		Payload:   payloadRaw,
	}
	r.broadcastEnvelope(env, "")
}
