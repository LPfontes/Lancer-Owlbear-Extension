import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { StatusController } from '@/classes/components/combat/StatusController'
import { EffectSpecial } from '@/classes/components/feature/active_effects/effect_subtype/EffectSpecial'
import {
  STATUS_DEFINITIONS,
  COVER_DEFINITIONS,
  sortStatusMarkers,
  toggleStatus,
  setCover,
  getActiveCover,
  getStatusBadgeUrl,
  getCustomStatusBadgeUrl,
  customStatusMarkerId,
  burnStatusMarkerId,
} from '../statusIcons'
import {
  currentIconsConfig,
  sanitizeStatusIconsConfig,
  applyStatusIconsConfigFromMetadata,
  ROOM_STATUS_ICONS_KEY,
  LEGACY_ROOM_STATUS_ICONS_KEY,
} from '../statusIconConfig'
import { patchFieldTarget } from '../sheetSyncPaths'

describe('Native LANCER Token Status & Sync Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    currentIconsConfig.value = {
      v: 1,
      customUrls: {},
      badgeScale: 0.28,
      placement: 'right',
    }
  })

  describe('Status Catalog & Helpers', () => {
    it('classifies all 19 statuses with category and originalName', () => {
      expect(STATUS_DEFINITIONS.length).toBeGreaterThanOrEqual(19)
      for (const def of STATUS_DEFINITIONS) {
        expect(def.id).toBeTruthy()
        expect(def.originalName).toBeTruthy()
        expect(['condition', 'state', 'cover', 'special']).toContain(def.category)
      }
      expect(COVER_DEFINITIONS.map(c => c.id)).toEqual(['softcover', 'hardcover'])
    })

    it('sorts cover first, standard statuses in the middle, and custom statuses last', () => {
      const sorted = sortStatusMarkers([
        customStatusMarkerId('Alvo'),
        'lockon',
        'hardcover',
        'burn:3',
        'softcover',
      ])
      expect(sorted).toEqual(['softcover', 'lockon', 'burn:3', 'custom:Alvo'])
    })

    it('toggles statuses and enforces mutual exclusivity between softcover and hardcover', () => {
      let list: string[] = []
      list = toggleStatus(list, 'softcover')
      expect(list).toEqual(['softcover'])

      list = toggleStatus(list, 'lockon')
      expect(list).toEqual(['softcover', 'lockon'])

      list = toggleStatus(list, 'hardcover')
      expect(list).toEqual(['hardcover', 'lockon'])
      expect(getActiveCover(list)).toBe('hardcover')

      list = setCover(list, 'none')
      expect(list).toEqual(['lockon'])
      expect(getActiveCover(list)).toBe('none')
    })

    it('uses custom external URLs from RoomStatusIconsConfig when configured', () => {
      expect(getStatusBadgeUrl('lockon')).toContain('/status-icons/lockon.svg')

      applyStatusIconsConfigFromMetadata({
        [ROOM_STATUS_ICONS_KEY]: {
          v: 1,
          customUrls: {
            lockon: 'https://cdn.example.com/custom-lockon.png',
            customstatus: 'https://cdn.example.com/custom-star.png',
          },
          badgeScale: 0.38,
          placement: 'left',
        },
      })

      expect(getStatusBadgeUrl('lockon')).toBe('https://cdn.example.com/custom-lockon.png')
      expect(getCustomStatusBadgeUrl()).toBe('https://cdn.example.com/custom-star.png')
      expect(currentIconsConfig.value.badgeScale).toBe(0.38)
      expect(currentIconsConfig.value.placement).toBe('left')
    })

    it('reads legacy com.lancer.status_markers/custom_icons metadata key seamlessly', () => {
      const changed = applyStatusIconsConfigFromMetadata({
        [LEGACY_ROOM_STATUS_ICONS_KEY]: {
          v: 1,
          customUrls: { impaired: 'https://cdn.example.com/impaired.svg' },
          badgeScale: 0.2,
          placement: 'bottom',
        },
      })
      expect(changed).toBe(true)
      expect(getStatusBadgeUrl('impaired')).toBe('https://cdn.example.com/impaired.svg')
      expect(currentIconsConfig.value.placement).toBe('bottom')
    })

    it('sanitizes invalid URLs and clamps badgeScale', () => {
      const sanitized = sanitizeStatusIconsConfig({
        customUrls: {
          lockon: 'javascript:alert(1)',
          slow: 'https://valid.example.com/slow.png',
        },
        badgeScale: 99,
        placement: 'invalid',
      })
      expect(sanitized.customUrls).toEqual({ slow: 'https://valid.example.com/slow.png' })
      expect(sanitized.badgeScale).toBe(0.45)
      expect(sanitized.placement).toBe('right')
    })
  })

  describe('Sheet Sync Paths for Statuses, Cover, Braced & Custom Statuses', () => {
    it('classifies all status-related patch paths accurately', () => {
      expect(patchFieldTarget('mechs.0.statuses')).toBe('statuses')
      expect(patchFieldTarget('statuses')).toBe('statuses')
      expect(patchFieldTarget('mechs.0.customStatuses')).toBe('customStatuses')
      expect(patchFieldTarget('mechs.0.cover')).toBe('cover')
      expect(patchFieldTarget('mechs.0.braced')).toBe('braced')
      expect(patchFieldTarget('mechs.0.stats.current.burn')).toBe('stat')
    })
  })

  describe('StatusController Reconciliation & Partial Deserialization (No Sheet/Table Conflict)', () => {
    it('preserves CustomStatuses and Resistances on partial statuses Deserialize and reconciles ApplyMarkerStatusIds', () => {
      let currentBurn = 0
      const mockCombatController: any = {
        Cover: 'none',
        Braced: false,
        IsInDangerZone: false,
        CombatLogVersion: 0,
        StatController: {
          getCurrent: (key: string) => (key === 'burn' ? currentBurn : 0),
          setCurrentStat: (key: string, val: number) => {
            if (key === 'burn') currentBurn = val
          },
        },
        Record: vi.fn(),
      }
      mockCombatController.ActiveActor = { CombatController: mockCombatController }

      const sc = new StatusController(mockCombatController)
      mockCombatController.StatusController = sc

      sc.Resistances = [{ type: 'kinetic', condition: 'resistance' }]
      sc.CustomStatuses = [
        {
          status: new EffectSpecial({ attribute: 'Sobrecarga', detail: '' }),
          expires: sc.ResolveExpiration(undefined),
        },
      ]

      // Partial Deserialize from PATCH_FIELD ({ statuses: [...] }) MUST NOT wipe CustomStatuses or Resistances
      sc.Deserialize({
        statuses: [{ status: 'lockon', expires: null, selfInflicted: false }],
      })

      expect(sc.Statuses.length).toBe(1)
      expect(sc.Statuses[0].status.ID.toLowerCase()).toBe('lockon')
      expect(sc.CustomStatuses.length).toBe(1)
      expect(sc.CustomStatuses[0].status.Attribute).toBe('Sobrecarga')
      expect(sc.Resistances.length).toBe(1)

      // ApplyMarkerStatusIds from TokenStatusMenu updates Cover, Braced, Burn, CustomStatuses, and Statuses together
      sc.ApplyMarkerStatusIds([
        'hardcover',
        'impaired',
        'braced',
        burnStatusMarkerId(4),
        customStatusMarkerId('Alvo Prioritário'),
      ])

      expect(mockCombatController.Cover).toBe('hard')
      expect(mockCombatController.Braced).toBe(true)
      expect(currentBurn).toBe(4)
      expect(sc.Statuses.map(s => s.status.ID.toLowerCase())).toEqual(['impaired'])
      expect(sc.CustomStatuses.map(c => c.status.Attribute)).toEqual(['Alvo Prioritário'])

      const roundtrip = sc.MarkerStatusIds(mockCombatController)
      expect(roundtrip).toEqual([
        'hardcover',
        'impaired',
        'braced',
        'burn:4',
        'custom:Alvo Prioritário',
      ])
    })
  })
})
