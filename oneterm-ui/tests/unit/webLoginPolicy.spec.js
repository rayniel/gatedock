import { webLoginProviders } from '@/utils/webLoginPolicy'
import LoginPage from '@/views/user/Login'
import user from '@/store/global/user'
import { getAuthDataEnable, getWebLoginPolicy } from '@/api/auth'
import { login } from '@/api/login'

jest.mock('@/utils/util', () => ({ timeFix: jest.fn() }))
jest.mock('@/utils/request', () => ({ axios: jest.fn() }))
jest.mock('@/api/auth', () => ({ getAuthDataEnable: jest.fn(), getWebLoginPolicy: jest.fn() }))
jest.mock('@/api/login', () => ({ login: jest.fn() }))

describe('Web login deployment policy', () => {
  const providers = [{ auth_type: 'LDAP' }, { auth_type: 'OIDC' }, { auth_type: 'CAS' }]

  it('offers only OIDC when Web password login is disabled', () => {
    expect(webLoginProviders({ enable_list: providers, web_local_login_enabled: false }))
      .toEqual([{ auth_type: 'OIDC' }])
    expect(webLoginProviders({ enable_list: [{ auth_type: 'LDAP' }], web_local_login_enabled: false }))
      .toEqual([])
  })

  it('preserves enabled deployments and handles missing configuration', () => {
    expect(webLoginProviders({ enable_list: providers, web_local_login_enabled: true }))
      .toEqual([{ auth_type: 'OIDC' }, { auth_type: 'CAS' }])
    expect(webLoginProviders(undefined)).toEqual([])
    expect(webLoginProviders({ enable_list: providers })).toEqual([])
  })

  it('keeps the password form closed until a valid enabled policy is loaded', () => {
    for (const value of [undefined, false, 'true']) {
      expect(LoginPage.computed.localLoginEnabled.call({ auth_enable: { web_local_login_enabled: value } })).toBe(false)
    }
    expect(LoginPage.computed.localLoginEnabled.call({ auth_enable: { web_local_login_enabled: true } })).toBe(true)
  })

  it('rejects password submission while disabled before validating or calling login', () => {
    const vm = {
      localLoginEnabled: false,
      $message: { error: jest.fn() },
      $t: key => key,
      Login: jest.fn()
    }
    const event = { preventDefault: jest.fn() }
    LoginPage.methods.handleSubmit.call(vm, event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(vm.$message.error).toHaveBeenCalledWith('cs.login.localLoginDisabled')
    expect(vm.Login).not.toHaveBeenCalled()
  })

  it('reports policy loading errors on the login page', async () => {
    const vm = {
      GetAuthDataEnable: jest.fn().mockRejectedValue(new Error('Policy unavailable')),
      $message: { error: jest.fn() },
      $t: key => key
    }
    await LoginPage.mounted.call(vm)
    expect(vm.$message.error).toHaveBeenCalledWith('cs.login.policyFailed')
  })

  it.each([true, false])('loads runtime policy %s with configured providers', async enabled => {
    getAuthDataEnable.mockResolvedValue({ enable_list: providers, auth_auto_redirect: 1 })
    getWebLoginPolicy.mockResolvedValue({ web_local_login_enabled: enabled })
    const commit = jest.fn()
    await user.actions.GetAuthDataEnable({ commit })
    expect(commit).toHaveBeenNthCalledWith(1, 'SET_AUTH_ENABLE', {})
    expect(commit).toHaveBeenLastCalledWith('SET_AUTH_ENABLE', {
      enable_list: providers,
      auth_auto_redirect: 1,
      web_local_login_enabled: enabled
    })
  })

  it.each([null, {}, { web_local_login_enabled: 'false' }])('rejects invalid policies without restoring cached login access', async policy => {
    getAuthDataEnable.mockResolvedValue({ enable_list: providers })
    getWebLoginPolicy.mockResolvedValue(policy)
    const commit = jest.fn()
    await expect(user.actions.GetAuthDataEnable({ commit })).rejects.toThrow('Invalid Web login policy')
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith('SET_AUTH_ENABLE', {})
  })

  it('propagates failed policy requests without a password fallback', async () => {
    getWebLoginPolicy.mockRejectedValue(new Error('Gateway unavailable'))
    const commit = jest.fn()
    await expect(user.actions.GetAuthDataEnable({ commit })).rejects.toThrow('Gateway unavailable')
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('redirects OIDC login without consuming a nonexistent password response', async () => {
    login.mockReturnValue(undefined)
    const commit = jest.fn()
    await expect(user.actions.Login({ commit }, { userInfo: {}, auth_type: 'OIDC' })).resolves.toBeUndefined()
    expect(login).toHaveBeenCalledWith({}, 'OIDC')
    expect(commit).not.toHaveBeenCalled()
  })
})
