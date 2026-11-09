<template>
  <div ref="desktop" class="standalone-desktop">
    <GuacamolePanel
      v-if="ready && !ended"
      ref="client"
      class="standalone-desktop-display"
      :isFullScreen="false"
      :assetId="$route.params.asset_id"
      :accountId="$route.params.account_id"
      :protocol="$route.params.protocol"
      :assetPermissions="permissions"
      :preferenceSetting="preferenceSetting"
      @open="connected = true"
      @close="handleClose"
      @updatePreferenceSetting="refreshPreference"
    />

    <div v-if="!ready || ended" class="standalone-desktop-status" role="status">
      <a-icon v-if="loading" type="loading" />
      <p>{{ statusText }}</p>
      <a-button v-if="!loading" @click="load">{{ $t('oneterm.desktop.reconnect') }}</a-button>
      <a href="/oneterm/workstation">{{ $t('oneterm.menu.workStation') }}</a>
    </div>

    <div class="standalone-desktop-controls" @keydown.stop @keyup.stop>
      <a-button
        :aria-label="$t('oneterm.desktop.toggleToolbar')"
        :aria-expanded="toolbarVisible"
        @click="toolbarVisible = !toolbarVisible"
      >
        <a-icon :type="toolbarVisible ? 'up' : 'down'" />
      </a-button>
      <div v-show="toolbarVisible" class="standalone-desktop-toolbar">
        <span class="standalone-desktop-title" :title="title">{{ title }}</span>
        <a-button @click="toggleFullscreen">
          <a-icon :type="fullscreen ? 'fullscreen-exit' : 'fullscreen'" />
          {{ $t(fullscreen ? 'oneterm.workStation.exitFullScreen' : 'oneterm.workStation.fullScreen') }}
        </a-button>
        <a-button :disabled="!connected" @click="callClient('openResolutionModal')">
          {{ $t('oneterm.terminalDisplay.resolution') }}
        </a-button>
        <a-button
          v-if="permissions[PERMISSION_TYPE.PASTE]"
          :disabled="!connected"
          @click="callClient('openClipboardModal')"
        >
          {{ $t('oneterm.guacamole.clipboard') }}
        </a-button>
        <a-button
          v-if="permissions[PERMISSION_TYPE.FILE_UPLOAD] || permissions[PERMISSION_TYPE.FILE_DOWNLOAD]"
          :disabled="!connected"
          @click="callClient('openFileManagementDrawer')"
        >
          {{ $t('oneterm.fileManagement.name') }}
        </a-button>
        <a-button :disabled="!ready || ended" @click="handleClose">
          {{ $t('oneterm.desktop.disconnect') }}
        </a-button>
      </div>
    </div>
  </div>
</template>

<script>
import GuacamolePanel from '../guacamoleClient'
import { getPreference } from '@/modules/oneterm/api/preference'
import { getAssetPermissions } from '@/modules/oneterm/api/asset'
import { connectionPermissions } from '@/modules/oneterm/utils/permissions'
import { defaultPreferenceSetting } from '../../systemSettings/terminalDisplay/constants'
import { PERMISSION_TYPE } from '../../systemSettings/accessControl/constants'

export default {
  name: 'StandaloneDesktop',
  components: { GuacamolePanel },
  data() {
    return {
      PERMISSION_TYPE,
      permissions: connectionPermissions(),
      preferenceSetting: null,
      ready: false,
      loading: true,
      connected: false,
      ended: false,
      error: '',
      toolbarVisible: false,
      fullscreen: false,
      disposed: false
    }
  },
  computed: {
    title() {
      return this.$route.query.title || this.$t('oneterm.desktop.title')
    },
    statusText() {
      if (this.loading) return this.$t('oneterm.desktop.loading')
      return this.error || this.$t('oneterm.desktop.disconnected')
    }
  },
  mounted() {
    document.addEventListener('fullscreenchange', this.onFullscreenChange)
    this.load()
  },
  beforeDestroy() {
    this.disposed = true
    document.removeEventListener('fullscreenchange', this.onFullscreenChange)
  },
  methods: {
    async load() {
      this.loading = true
      this.error = ''
      this.ready = false
      this.ended = false
      this.connected = false
      try {
        const { asset_id, account_id, protocol } = this.$route.params
        if (!/^rdp:\d+$/.test(protocol)) throw new Error(this.$t('oneterm.desktop.invalidProtocol'))
        const [response] = await Promise.all([
          getAssetPermissions(asset_id, { account_ids: account_id }),
          this.loadPreference()
        ])
        if (this.disposed) return
        this.permissions = connectionPermissions(response?.data?.results?.[account_id]?.results)
        if (!this.permissions[PERMISSION_TYPE.CONNECT]) throw new Error(this.$t('oneterm.desktop.permissionDenied'))
        this.ready = true
      } catch (error) {
        if (this.disposed) return
        this.error = error.message || this.$t('oneterm.failedToLoadPermissions')
        this.$message.error(this.error)
      } finally {
        if (!this.disposed) this.loading = false
      }
    },
    async loadPreference() {
      const response = await getPreference()
      if (!this.disposed) {
        this.preferenceSetting = { ...defaultPreferenceSetting, ...response?.data }
      }
    },
    async refreshPreference() {
      try {
        await this.loadPreference()
      } catch (error) {
        this.$message.error(this.$t('oneterm.desktop.preferenceFailed'))
      }
    },
    handleClose() {
      this.connected = false
      this.ended = true
    },
    callClient(method) {
      this.$refs.client[method]()
    },
    onFullscreenChange() {
      this.fullscreen = document.fullscreenElement === document.documentElement
    },
    async toggleFullscreen() {
      try {
        if (this.fullscreen) {
          await document.exitFullscreen()
        } else {
          await document.documentElement.requestFullscreen()
        }
      } catch (error) {
        this.$message.error(this.$t('oneterm.desktop.fullscreenFailed'))
      }
    }
  }
}
</script>

<style lang="less" scoped>
.standalone-desktop {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: #000;
  color: #fff;

  &-display {
    width: 100%;
    height: 100%;
  }

  &-controls {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1001;
    max-width: 100%;
    text-align: center;
  }

  &-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    background: #1d2129;
    border-radius: 0 0 8px 8px;
  }

  &-title {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &-status {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }
}
</style>
