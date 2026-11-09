<template>
  <div class="access-control system-settings-panel">
    <a-form-model
      v-if="isAdmin"
      ref="configForm"
      class="system-settings-form"
      :model="form"
      :rules="rules"
      :label-col="{ xs: { span: 24 }, sm: { span: 7 } }"
      :wrapper-col="{ xs: { span: 24 }, sm: { span: 14 } }"
    >
      <a-form-model-item :label="$t('oneterm.accessControl.timeout')" prop="timeout">
        <a-input-number
          :min="0"
          :max="7200"
          v-model="form.timeout"
          :formatter="(value) => `${value}s`"
          :parser="(value) => value.replace('s', '')"
        />
      </a-form-model-item>

      <a-form-model-item
        prop="default_permissions"
        :label="$t('oneterm.accessControl.permissionConfig')"
        :extra="$t('oneterm.accessControl.permissionConfigTip')"
      >
        <PermissionCheckbox
          :value="form.default_permissions"
          @change="handlePermissionChange"
        />
      </a-form-model-item>

      <a-form-model-item label=" " :colon="false">
        <a-space>
          <a-button :loading="loading" @click="getConfig()">{{ $t('reset') }}</a-button>
          <a-button :loading="loading" type="primary" @click="handleSave">{{ $t('save') }}</a-button>
        </a-space>
      </a-form-model-item>
    </a-form-model>

    <a-divider orientation="left">{{ $t('oneterm.accessControl.personalPreferences') }}</a-divider>
    <a-form-model
      class="system-settings-form access-control-preference"
      :label-col="{ xs: { span: 24 }, sm: { span: 7 } }"
      :wrapper-col="{ xs: { span: 24 }, sm: { span: 14 } }"
    >
      <a-form-model-item
        :label="$t('oneterm.accessControl.directClipboard')"
        :extra="$t('oneterm.accessControl.directClipboardTip')"
      >
        <a-switch v-model="directClipboard" :disabled="!preferenceReady || preferenceLoading" />
      </a-form-model-item>
      <a-form-model-item label=" " :colon="false">
        <a-space>
          <a-button :loading="preferenceLoading" @click="getClipboardPreference">{{ $t('reset') }}</a-button>
          <a-button
            type="primary"
            :loading="preferenceLoading"
            :disabled="!preferenceReady"
            @click="saveClipboardPreference"
          >{{ $t('save') }}</a-button>
        </a-space>
      </a-form-model-item>
    </a-form-model>
  </div>
</template>

<script>
import { getConfig, postConfig } from '@/modules/oneterm/api/config'
import { getPreference, putPreference } from '@/modules/oneterm/api/preference'
import { PERMISSION_TYPE } from './constants.js'

import PermissionCheckbox from './permissionCheckbox.vue'

const DEFAULT_PERMISSIONS = Object.values(PERMISSION_TYPE).reduce((config, key) => {
  config[key] = false
  return config
}, {})

export default {
  name: 'AccessControl',
  components: {
    PermissionCheckbox
  },
  props: {
    isAdmin: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      loading: false,
      directClipboard: false,
      preferenceLoading: false,
      preferenceReady: false,
      rules: {},
      form: {
        timeout: 5,
        default_permissions: { ...DEFAULT_PERMISSIONS }
      }
    }
  },
  mounted() {
    if (this.isAdmin) this.getConfig()
    this.getClipboardPreference()
  },
  methods: {
    async getClipboardPreference() {
      this.preferenceLoading = true
      this.preferenceReady = false
      try {
        const response = await getPreference()
        this.directClipboard = response?.data?.settings?.directClipboard === true
        this.preferenceReady = true
      } finally {
        this.preferenceLoading = false
      }
    },
    async saveClipboardPreference() {
      this.preferenceLoading = true
      try {
        await putPreference({ settings: { directClipboard: this.directClipboard } })
        this.$message.success(this.$t('saveSuccess'))
      } finally {
        this.preferenceLoading = false
      }
    },
    getConfig() {
      getConfig({
        info: true
      }).then((res) => {
        const { timeout = 5, default_permissions } = res?.data
        this.form = {
          timeout,
          default_permissions: default_permissions || { ...DEFAULT_PERMISSIONS }
        }
      })
    },
    handlePermissionChange(key, checked) {
      this.form.default_permissions[key] = checked
    },
    handleSave() {
      this.loading = true
      postConfig({ ...this.form })
        .then(() => {
          this.$message.success(this.$t('saveSuccess'))
        })
        .finally(async () => {
          this.getConfig()
          this.loading = false
        })
    },
  },
}
</script>

<style lang="less" scoped>
.access-control {
  padding: 18px 0;

  &-label {
    display: inline-flex;
    align-items: center;

    &-icon {
      margin-left: 6px;
      color: @text-color_3;
    }
  }
}
</style>
