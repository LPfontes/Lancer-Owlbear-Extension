package models

import (
	"encoding/json"
	"testing"
)

func TestApplyDotPath(t *testing.T) {
	initial := map[string]interface{}{
		"stats": map[string]interface{}{
			"current": map[string]interface{}{
				"hp":   float64(10),
				"heat": float64(2),
			},
		},
		"mechs": []interface{}{
			map[string]interface{}{
				"name": "Barbarossa",
				"combat_data": map[string]interface{}{
					"statuses": []interface{}{"Lock On"},
				},
			},
		},
	}

	// 1. Modificar campo aninhado existente
	res, err := ApplyDotPath(initial, "stats.current.hp", 14)
	if err != nil {
		t.Fatalf("Erro ao aplicar dot-path: %v", err)
	}
	m := res.(map[string]interface{})
	hp := m["stats"].(map[string]interface{})["current"].(map[string]interface{})["hp"]
	if hp != 14 {
		t.Fatalf("Esperava hp 14, obteve %v", hp)
	}

	// 2. Modificar dentro de um array
	res, err = ApplyDotPath(initial, "mechs.0.name", "Gorgon")
	if err != nil {
		t.Fatalf("Erro ao aplicar dot-path em array: %v", err)
	}
	mechName := res.(map[string]interface{})["mechs"].([]interface{})[0].(map[string]interface{})["name"]
	if mechName != "Gorgon" {
		t.Fatalf("Esperava 'Gorgon', obteve %v", mechName)
	}
}

func TestApplyDotPathRejectsNegativeIndex(t *testing.T) {
	initial := map[string]interface{}{
		"mechs": []interface{}{
			map[string]interface{}{"corePower": true},
		},
	}

	// "mechs.-1.corePower" (cliente sem mech ativo) precisa falhar, não estourar o slice.
	if _, err := ApplyDotPath(initial, "mechs.-1.corePower", false); err == nil {
		t.Fatal("Esperava erro para índice negativo, obteve nil")
	}

	// O caminho válido continua funcionando depois do erro.
	res, err := ApplyDotPath(initial, "mechs.0.corePower", false)
	if err != nil {
		t.Fatalf("Erro ao aplicar dot-path válido: %v", err)
	}
	corePower := res.(map[string]interface{})["mechs"].([]interface{})[0].(map[string]interface{})["corePower"]
	if corePower != false {
		t.Fatalf("Esperava corePower false, obteve %v", corePower)
	}
}

func TestApplyPatchToRawJSON(t *testing.T) {
	raw := json.RawMessage(`{"stats":{"current":{"hp":10}}}`)
	updated, err := ApplyPatchToRawJSON(raw, "stats.current.hp", 15)
	if err != nil {
		t.Fatalf("Erro: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(updated, &parsed); err != nil {
		t.Fatalf("Erro unmarshal: %v", err)
	}

	hp := parsed["stats"].(map[string]interface{})["current"].(map[string]interface{})["hp"]
	if hp != float64(15) {
		t.Fatalf("Esperava 15, obteve %v", hp)
	}
}

// Os caminhos de STAT carregam EVENTOS (dano/calor aplicados pelo Combat Tracker) e por
// isso a sala aceita patch atrasado neles — foi assim que o dano do tracker parava de
// chegar na ficha do jogador (a janela do Mestre nao via os patches das outras janelas do
// mesmo jogador e mandava uma versao menor).
func TestIsStatPath(t *testing.T) {
	casos := map[string]bool{
		"mechs.0.stats.current.hp":               true,
		"mechs.12.stats.current.heat":            true,
		"stats.current.hp":                       true,
		"stats.current.overshield":               true,
		"mechs.0.statuses":                       false,
		"mechs.0.combatActions":                  false,
		"mechs.0.loadouts.0.systems.0.destroyed": false,
		"hp":                                     false,
	}

	for caminho, esperado := range casos {
		if got := IsStatPath(caminho); got != esperado {
			t.Fatalf("IsStatPath(%q) = %v, esperava %v", caminho, got, esperado)
		}
	}
}
