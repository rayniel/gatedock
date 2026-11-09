<template>
  <div
    :class="[
      isFullScreen ? 'oneterm-guacamole-full' : 'oneterm-guacamole-panel'
    ]"
  >
    <div
      ref="onetermGuacamoleRef"
      class="oneterm-guacamole-wrap"
      @paste.capture="handleDirectPaste"
    ></div>

    <ClipboardModal
      ref="clipboardModalRef"
      @ok="handleClipboardOk"
    />

    <ResolutionModal
      ref="resolutionModalRef"
      @ok="handleResolutionOk"
    />

    <FileManagementDrawer
      ref="fileManagementDrawerRef"
      connectType="rdp"
      :sessionId="sessionId"
      :assetPermissions="assetPermissions"
    />
  </div>
</template>

<script>
import _ from 'lodash'
import { v4 as uuidv4 } from 'uuid'
import Guacamole from 'guacamole-common-js'
import { pageBeforeUnload } from '@/modules/oneterm/utils/index.js'
import { PERMISSION_TYPE } from '@/modules/oneterm/views/systemSettings/accessControl/constants.js'

import ClipboardModal from './clipboardModal.vue'
import ResolutionModal from './resolutionModal.vue'
import FileManagementDrawer from '../fileManagement/fileManagementDrawer.vue'

const STATE_IDLE = 0
const STATE_CONNECTING = 1
const STATE_WAITING = 2
const STATE_CONNECTED = 3
const STATE_DISCONNECTING = 4
const STATE_DISCONNECTED = 5
const META_KEYS = [65511, 65512, 65515, 65516]

export default {
  name: 'GuacamoleClient',
  components: {
    ClipboardModal,
    ResolutionModal,
    FileManagementDrawer
  },
  props: {
    assetId: {
      type: [String, Number],
      default: ''
    },
    accountId: {
      type: [String, Number],
      default: ''
    },
    protocol: {
      type: String,
      default: ''
    },
    isFullScreen: {
      type: Boolean,
      default: true,
    },
    shareId: {
      type: String,
      default: ''
    },
    preferenceSetting: {
      type: [Object, null],
      default: null
    },
    assetPermissions: {
      type: Object,
      default: () => {}
    }
  },
  data() {
    return {
      client: null,
      clientState: STATE_IDLE,
      messageKey: 'message',
      resizeObserver: null, // guacamoleClient container size observer
      resizeHandler: null,
      requestedSize: null,
      sessionId: '',
      clipboardWarningShown: false,
      disposed: false,
      keyboard: null,
    }
  },
  computed: {
    directClipboard() {
      return this.preferenceSetting?.settings?.directClipboard === true && !this.$route?.query?.is_monitor
    },
    resolution() {
      const resolution = this?.preferenceSetting?.settings?.resolution || 'auto'
      return resolution === 'auto' ? 'auto' : resolution.split('x')
    }
  },
  watch: {
    resolution: {
      handler() {
        this.handleResolutionUpdate()
      },
    }
  },
  async mounted() {
    this.init()
    if (!this.$route?.query?.is_monitor) {
      window.addEventListener('beforeunload', pageBeforeUnload)
    }
  },
  beforeDestroy() {
    this.disposed = true
    this.$message.destroy(this.messageKey)

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
    if (this.resizeHandler) {
      this.resizeHandler.cancel()
    }

    if (this.client) {
      this.client.disconnect()
    }

    if (!this.$route?.query?.is_monitor) {
      window.removeEventListener('beforeunload', pageBeforeUnload)
    }
  },
  methods: {
    init() {
      const { session_id, is_monitor } = this.$route.query
      let { asset_id, account_id, protocol: queryProtocol } = this.$route.params

      if (!this.isFullScreen) {
        asset_id = this.assetId
        account_id = this.accountId
        queryProtocol = this.protocol
      }

      const protocol = document.location.protocol.startsWith('https') ? 'wss' : 'ws'

      let socketLink = ''
      // audit page (online session, offline session)
      if (is_monitor) {
        socketLink = `${protocol}://${document.location.host}/api/oneterm/v1/connect/monitor/${session_id}`
      // share page (temporary link)
      } else if (this.shareId) {
        socketLink = `${protocol}://${document.location.host}/api/oneterm/v1/share/connect/${this.shareId}`
      // work station
      } else {
        socketLink = `${protocol}://${document.location.host}/api/oneterm/v1/connect/${asset_id}/${account_id}/${queryProtocol}`
      }

      const tunnel = new Guacamole.WebSocketTunnel(socketLink)
      const client = new Guacamole.Client(tunnel)

      if (this?.assetPermissions?.[PERMISSION_TYPE.COPY]) {
        // handle the clipboard content received from the remote desktop.
        client.onclipboard = this.handleClipboardReceived
      }

      // 处理客户端的状态变化事件
      client.onstatechange = (state) => {
        this.onClientStateChange(state)
      }

      client.onerror = this.onError
      client.ondisconnect = this.onDisconnect
      tunnel.onerror = this.onError

      // Get display div from document
      const displayEle = this.$refs.onetermGuacamoleRef
      // Add client to display div
      const element = client.getDisplay().getElement()
      displayEle.appendChild(element)

      const { width, height } = this.getClientSize()
      this.requestedSize = { width, height }
      let queryString = `w=${width}&h=${height}&dpi=96`
      // workstation page
      if (!is_monitor && !this.shareId) {
        const sessionId = uuidv4()
        this.sessionId = sessionId
        queryString += `&session_id=${sessionId}`
      }

      client.connect(queryString)

      const display = client.getDisplay()
      display.onresize = () => {
        this.handleDisplaySize()
      }

      const sink = new Guacamole.InputSink()
      displayEle.appendChild(sink.getElement())
      sink.focus()

      const keyboard = new Guacamole.Keyboard(sink.getElement())
      this.keyboard = keyboard

      keyboard.onkeydown = (keysym) => {
        // Use Command as Control for remote desktop shortcuts on macOS.
        if (this.directClipboard && META_KEYS.includes(keysym)) {
          client.sendKeyEvent(1, 65507)
          return true
        }
        // Let the browser supply paste text before forwarding the remote shortcut.
        if (this.isBrowserPasteKey(keysym, keyboard.pressed)) return true
        client.sendKeyEvent(1, keysym)
        if (keysym === 65288) {
          return false
        }
      }
      keyboard.onkeyup = (keysym) => {
        if (this.directClipboard && META_KEYS.includes(keysym)) {
          client.sendKeyEvent(0, 65507)
          return
        }
        client.sendKeyEvent(0, keysym)
      }

      const sinkFocus = _.debounce(() => {
        sink.focus()
      })

      const mouse = new Guacamole.Mouse(element)
      const sendMouseState = (state) => {
        if (!is_monitor) {
          client.sendMouseState(state, true)
        }
      }
      mouse.onmousedown = mouse.onmouseup = function(mouseState) {
        sinkFocus()
        sendMouseState(mouseState)
      }
      mouse.onmousemove = function(mouseState) {
        sinkFocus()
        client.getDisplay().showCursor(false)
        sendMouseState(mouseState)
      }

      const touch = new Guacamole.Mouse.Touchpad(element) // or Guacamole.Touchscreen

      touch.onmousedown = touch.onmousemove = touch.onmouseup = function(state) {
        sendMouseState(state)
      }
      this.client = client

      if (this.$refs.onetermGuacamoleRef) {
        this.resizeHandler = _.debounce((entries) => {
          if (entries?.length) {
            this.handleDisplaySize()
          }
        }, 200)
        this.resizeObserver = new ResizeObserver(this.resizeHandler)
        this.resizeObserver.observe(this.$refs.onetermGuacamoleRef)
      }
    },
    onClientStateChange(state) {
      this.clientState = state
      console.log('onClientStateChange', state)
      switch (state) {
        case STATE_IDLE:
          this.$message.destroy(this.messageKey)
          this.$message.loading({ content: this.$t('oneterm.guacamole.idle'), duration: 0, key: this.messageKey })
          break
        case STATE_CONNECTING:
          this.$message.destroy(this.messageKey)
          this.$message.loading({ content: this.$t('oneterm.guacamole.connecting'), duration: 0, key: this.messageKey })
          break
        case STATE_WAITING:
          this.$message.destroy(this.messageKey)
          this.$message.loading({ content: this.$t('oneterm.guacamole.waiting'), duration: 0, key: this.messageKey })
          break
        case STATE_CONNECTED:
          this.handleDisplaySize()
          this.$message.destroy(this.messageKey)
          this.$message.success({ content: this.$t('oneterm.guacamole.connected'), duration: 3, key: this.messageKey })
          this.$emit('open')
          // 向后台发送请求，更新会话的状态
          //   sessionApi.connect(sessionId)
          break
        case STATE_DISCONNECTING:
          break
        case STATE_DISCONNECTED:
          if (this.client) {
            this.client.disconnect()
          }
          const guacamoleClient = this.$refs.onetermGuacamoleRef
          guacamoleClient.innerHTML = ''
          this.$message.destroy(this.messageKey)
          this.$emit('close')
          break
        default:
          break
      }
    },

    handleDisplaySize() {
      if (!this.client) return
      const guacamoleWrap = this.$refs.onetermGuacamoleRef
      if (!guacamoleWrap?.clientWidth || !guacamoleWrap?.clientHeight) return
      const display = this.client.getDisplay()
      const width = display.getWidth()
      const height = display.getHeight()
      if (width > 0 && height > 0) {
        display.scale(Math.min(guacamoleWrap.clientWidth / width, guacamoleWrap.clientHeight / height))
      }
      if (this.resolution === 'auto') this.handleResolutionUpdate()
    },

    handleResolutionUpdate() {
      if (!this.client || this.$route.query.is_monitor || this.clientState !== STATE_CONNECTED) return
      const { width, height } = this.getClientSize()
      if (!(width > 0 && height > 0)) return
      if (this.requestedSize?.width === width && this.requestedSize?.height === height) return
      this.requestedSize = { width, height }
      this.client.sendSize(width, height)
    },

    getClientSize() {
      const guacamoleWrap = this.$refs.onetermGuacamoleRef
      const width = this.resolution === 'auto' ? guacamoleWrap.clientWidth : this.resolution?.[0]
      const height = this.resolution === 'auto' ? guacamoleWrap.clientHeight : this.resolution?.[1]

      return {
        width: Number(width),
        height: Number(height)
      }
    },

    onError(status) {
      console.log('onError', status)
      this.$message.destroy(this.messageKey)
      this.$emit('close')

      if (status.code > 1000) {
        this.$message.info({
          content: decodeURIComponent(
            atob(status.message)
              .split('')
              .map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
              })
              .join('')
          ),
        })
      } else if (status.code < 1000 && status.message) {
        this.$message.info(status.message)
      }
    },
    onDisconnect() {
      console.log('onDisconnect')
      this.$emit('close')
    },

    handleClipboardReceived(stream, mimetype) {
      if (!this.assetPermissions?.[PERMISSION_TYPE.COPY] || this.$route?.query?.is_monitor) return
      if (/^text\//.exec(mimetype)) {
        const stringReader = new Guacamole.StringReader(stream)
        let str = ''
        stringReader.ontext = function ontext(text) {
          str += text
        }

        stringReader.onend = () => {
          if (this.disposed || !this.assetPermissions?.[PERMISSION_TYPE.COPY]) return
          if (this.directClipboard) {
            if (!this.$refs.onetermGuacamoleRef.contains(document.activeElement) || !document.hasFocus()) return
            if (!window.isSecureContext || !navigator.clipboard?.writeText) {
              this.warnClipboard('clipboardUnavailable')
              return
            }
            navigator.clipboard.writeText(str).catch(() => this.warnClipboard('clipboardFailed'))
          } else if (str) {
            this.$copyText(str).catch(() => this.warnClipboard('clipboardFailed'))
          }
        }
      }
    },

    handleClipboardOk(content) {
      if (!this.assetPermissions?.[PERMISSION_TYPE.PASTE] || this.$route?.query?.is_monitor) {
        this.$message.warning(this.$t('oneterm.guacamole.clipboardPermissionDenied'))
        return
      }
      if (this.client && this.clientState === STATE_CONNECTED && typeof content === 'string') {
        const stream = this.client.createClipboardStream('text/plain')
        const writer = new Guacamole.StringWriter(stream)

        for (let i = 0; i < content.length; i += 4096) {
          writer.sendText(content.substring(i, i + 4096))
        }

        writer.sendEnd()
        return true
      }
    },

    handleDirectPaste(event) {
      if (!this.directClipboard || this.clientState !== STATE_CONNECTED) return
      event.preventDefault()
      event.stopPropagation()
      if (!this.assetPermissions?.[PERMISSION_TYPE.PASTE]) {
        this.$message.warning(this.$t('oneterm.guacamole.clipboardPermissionDenied'))
        return
      }
      if (!event.clipboardData || !Array.from(event.clipboardData.types).includes('text/plain')) {
        this.warnClipboard('clipboardFailed')
        return
      }
      if (this.handleClipboardOk(event.clipboardData.getData('text/plain'))) {
        // Clipboard instructions and the shortcut share the same ordered tunnel.
        const pressed = this.keyboard?.pressed || {}
        const control = pressed[65507] || pressed[65508] ||
          META_KEYS.some(key => pressed[key])
        const shift = pressed[65505] || pressed[65506]
        const key = shift && !control ? 65379 : 118
        if (!control && !shift) this.client.sendKeyEvent(1, 65507)
        this.client.sendKeyEvent(1, key)
        this.client.sendKeyEvent(0, key)
        if (!control && !shift) this.client.sendKeyEvent(0, 65507)
      }
    },

    isBrowserPasteKey(keysym, pressed) {
      if (!this.directClipboard) return false
      const modifier = pressed[65507] || pressed[65508] || META_KEYS.some(key => pressed[key])
      return ((keysym === 118 || keysym === 86) && Boolean(modifier)) ||
        (keysym === 65379 && Boolean(pressed[65505] || pressed[65506]))
    },

    warnClipboard(key) {
      if (this.disposed || this.clipboardWarningShown) return
      this.clipboardWarningShown = true
      this.$message.warning(this.$t(`oneterm.guacamole.${key}`))
    },

    handleResolutionOk() {
      this.$emit('updatePreferenceSetting')
    },

    openClipboardModal() {
      if (!this.assetPermissions?.[PERMISSION_TYPE.PASTE] || this.$route?.query?.is_monitor) {
        this.$message.warning(this.$t('oneterm.guacamole.clipboardPermissionDenied'))
        return
      }
      this.$refs.clipboardModalRef.open()
    },

    openResolutionModal() {
      const resolution = this?.preferenceSetting?.settings?.resolution || 'auto'
      this.$refs.resolutionModalRef.open(resolution)
    },

    openFileManagementDrawer() {
      this.$refs.fileManagementDrawerRef.open()
    }
  }
}
</script>

<style lang="less" scoped>
.oneterm-guacamole-full {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh !important;
  background-color: #000000 !important;
  z-index: 1000;
}

.oneterm-guacamole-panel {
  width: 100%;
  height: 100%;
  background-color: #000000;
}

.oneterm-guacamole-wrap {
  width: 100%;
  height: 100%;

  /deep/ & > div {
    margin: 0 auto;
  }
}
</style>
