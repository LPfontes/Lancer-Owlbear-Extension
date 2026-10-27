package models

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// ApplyDotPath navega e aplica um valor em um caminho dot-notation dentro de um mapa arbitrário.
// Suporta chaves de objetos ("a.b") e índices de arrays ("mechs.0.name").
func ApplyDotPath(target interface{}, path string, value interface{}) (interface{}, error) {
	parts := strings.Split(path, ".")
	return setRecursive(target, parts, value)
}

func setRecursive(current interface{}, parts []string, value interface{}) (interface{}, error) {
	if len(parts) == 0 {
		return value, nil
	}

	head := parts[0]
	tail := parts[1:]

	// Se current for um map[string]interface{}
	if m, ok := current.(map[string]interface{}); ok {
		child, exists := m[head]
		if !exists && len(tail) > 0 {
			// Decide se o próximo nível parece array ou mapa
			if _, err := strconv.Atoi(tail[0]); err == nil {
				child = []interface{}{}
			} else {
				child = make(map[string]interface{})
			}
		}
		newChild, err := setRecursive(child, tail, value)
		if err != nil {
			return nil, err
		}
		m[head] = newChild
		return m, nil
	}

	// Se current for um []interface{}
	if s, ok := current.([]interface{}); ok {
		idx, err := strconv.Atoi(head)
		if err != nil {
			// Não é número: transforma em map se vazio ou retorna erro
			return nil, err
		}
		// Índice negativo (ex.: "mechs.-1.corePower" de um cliente sem mech ativo)
		// derrubaria a goroutine da sala com "index out of range": recusar a mutação
		// é melhor do que perder a sala inteira.
		if idx < 0 {
			return nil, fmt.Errorf("índice negativo no caminho: %q", head)
		}
		// Expande slice se necessário
		for len(s) <= idx {
			s = append(s, nil)
		}
		child := s[idx]
		if child == nil && len(tail) > 0 {
			if _, err := strconv.Atoi(tail[0]); err == nil {
				child = []interface{}{}
			} else {
				child = make(map[string]interface{})
			}
		}
		newChild, err := setRecursive(child, tail, value)
		if err != nil {
			return nil, err
		}
		s[idx] = newChild
		return s, nil
	}

	// Se for nulo e ainda houver caminho
	if current == nil {
		if _, err := strconv.Atoi(head); err == nil {
			return setRecursive([]interface{}{}, parts, value)
		}
		return setRecursive(make(map[string]interface{}), parts, value)
	}

	return value, nil
}

// ApplyPatchToRawJSON aplica uma mutação de campo dot-notation a um json.RawMessage e devolve o novo json.RawMessage.
// IsStatPath informa se o caminho do patch aponta para um STAT corrente
// (`stats.current.hp`, `mechs.0.stats.current.heat`, ...).
//
// Esses caminhos carregam EVENTOS (dano, calor, estresse, estrutura, burn) aplicados pelo
// Combat Tracker: diferentes janelas do mesmo jogador não veem os patches umas das outras,
// então a versão pode chegar atrasada — nesse caso a sala aceita assim mesmo, em vez de
// descartar o dano em silêncio.
func IsStatPath(path string) bool {
	return statPathRe.MatchString(path)
}

var statPathRe = regexp.MustCompile(`^(?:mechs\.\d+\.)?stats\.current\.[a-z_]+$`)

func ApplyPatchToRawJSON(raw json.RawMessage, path string, value interface{}) (json.RawMessage, error) {
	var parsed interface{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return raw, err
		}
	} else {
		parsed = make(map[string]interface{})
	}

	updated, err := ApplyDotPath(parsed, path, value)
	if err != nil {
		return raw, err
	}

	marshaled, err := json.Marshal(updated)
	if err != nil {
		return raw, err
	}

	return json.RawMessage(marshaled), nil
}
