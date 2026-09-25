<template>
  <v-app id="app" theme="dark" :class="{ 'app-minimized': windowManager.isMinimized.value }">
    <cc-notify />
    <AppNavbar />
    <v-main id="main-content" v-show="!windowManager.isMinimized.value">
      <router-view :key="$route.fullPath" />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { provide } from 'vue'
import CcNotify from '@/ui/notification/CCNotify.vue'
import AppNavbar from '@/ui/components/AppNavbar.vue'
import { windowManager } from '@/services/windowManager'
import { UserStore, CompendiumStore } from './stores'
import type { UserProfile } from '@/user'
import {
  CompendiumDataKey,
  UserDataKey,
  type CompendiumDataProvider,
  type UserDataProvider,
} from '@/ui/providers'

provide<CompendiumDataProvider>(CompendiumDataKey, {
  get Statuses() {
    return CompendiumStore().Statuses
  },
  get Frames() {
    return CompendiumStore().Frames
  },
  get NpcClasses() {
    return CompendiumStore().NpcClasses
  },
  get NpcFeatures() {
    return CompendiumStore().NpcFeatures
  },
  get ContentPacks() {
    return CompendiumStore().ContentPacks
  },
    getItemCollection: itemType => CompendiumStore().getItemCollection(itemType),
  referenceLink: (item, internal) => CompendiumStore().referenceLink(item, internal),
})

provide<UserDataProvider>(UserDataKey, {
  get User() {
    return UserStore().User as UserProfile
  },
  get IsLoggedIn() {
    return UserStore().IsLoggedIn
  },
  get CloudImages() {
    return UserStore().CloudImages
  },
  get CloudStorageUsed() {
    return UserStore().CloudStorageUsed
  },
  get MaxCloudStorage() {
    return UserStore().MaxCloudStorage
  },
  get CloudStorageFull() {
    return UserStore().CloudStorageFull
  },
    downloadLcp: pack => UserStore().downloadLcp(pack),
  refreshDbData: () => UserStore().refreshDbData(),
})

document.documentElement.setAttribute('data-font', 'inter')
</script>

<style>
body {
  margin: 0;
  overflow-x: hidden;
}

html:has(.app-minimized),
body:has(.app-minimized) {
  background: transparent !important;
  overflow: hidden !important;
}

.app-minimized {
  min-height: 48px !important;
  height: 48px !important;
  overflow: hidden !important;
  background: transparent !important;
}

.app-minimized .v-application__wrap {
  min-height: 48px !important;
  height: 48px !important;
  overflow: hidden !important;
  background: transparent !important;
}
</style>
