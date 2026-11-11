import Vue from 'vue'
import router from '@/router'
import store from '@/store'
import NProgress from 'nprogress'
import { message } from 'ant-design-vue'
import '@/guard'

jest.mock('vue', () => ({ ls: { get: jest.fn() } }))
jest.mock('@/router', () => ({ beforeEach: jest.fn(), afterEach: jest.fn(), addRoutes: jest.fn() }))
jest.mock('@/store', () => ({
  dispatch: jest.fn(),
  getters: { roles: [], appRoutes: [] },
  state: { user: { auth_enable: {} } }
}))
jest.mock('nprogress', () => ({ configure: jest.fn(), start: jest.fn(), done: jest.fn() }))
jest.mock('nprogress/nprogress.css', () => ({}))
jest.mock('@/utils/domUtil', () => ({ setDocumentTitle: jest.fn(), domTitle: '' }))
jest.mock('@/lang', () => ({ t: key => key }))
jest.mock('ant-design-vue', () => ({ message: { error: jest.fn() } }))

describe('Unauthenticated home page navigation', () => {
  const guard = router.beforeEach.mock.calls[0][0]
  const to = { path: '/oneterm/workbench', fullPath: '/oneterm/workbench?tab=assets', meta: {} }
  const from = { query: {} }
  let next

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    localStorage.clear()
    Vue.ls.get.mockReturnValue(null)
    store.getters.roles = []
    store.state.user.auth_enable = {
      enable_list: [{ auth_type: 'OIDC' }],
      web_local_login_enabled: false,
      auth_auto_redirect: 1
    }
    store.dispatch.mockResolvedValue(undefined)
    next = jest.fn()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('immediately starts OIDC without loading a logout page or waiting for timers', async () => {
    await guard(to, from, next)
    expect(store.dispatch.mock.calls).toEqual([
      ['GetAuthDataEnable'],
      ['Login', { userInfo: {}, auth_type: 'OIDC' }]
    ])
    expect(next).toHaveBeenCalledWith(false)
    expect(NProgress.done).toHaveBeenCalled()
    expect(setTimeout).not.toHaveBeenCalled()
  })

  it.each(['OIDC', ''])('clears expired %s credentials without remote logout or a three-second delay', async authType => {
    localStorage.setItem('ops_auth_type', authType)
    Vue.ls.get.mockReturnValue('expired-token')
    const error = Object.assign(new Error('Unauthorized'), { response: { status: 401 } })
    store.dispatch.mockImplementation(action => action === 'GetInfo'
      ? Promise.reject(error)
      : Promise.resolve())
    await guard(to, from, next)
    expect(store.dispatch.mock.calls.map(call => call[0]))
      .toEqual(['GetInfo', 'ResetSession', 'GetAuthDataEnable', 'Login'])
    expect(setTimeout).not.toHaveBeenCalled()
    expect(message.error).not.toHaveBeenCalled()
  })

  it('preserves the manual confirmation countdown when auto redirect is off', async () => {
    store.state.user.auth_enable.auth_auto_redirect = 0
    await guard(to, from, next)
    expect(next).toHaveBeenCalledWith({ path: '/user/logout', query: { redirect: to.fullPath } })
    expect(store.dispatch).not.toHaveBeenCalledWith('Login', expect.anything())
  })

  it('keeps multiple providers on the login selection page', async () => {
    store.state.user.auth_enable.web_local_login_enabled = true
    store.state.user.auth_enable.enable_list.push({ auth_type: 'CAS' })
    await guard(to, from, next)
    expect(next).toHaveBeenCalledWith({ path: '/user/login', query: { redirect: to.fullPath } })
  })

  it('reports policy errors and never guesses a provider', async () => {
    store.dispatch.mockRejectedValue(new Error('Policy unavailable'))
    await guard(to, from, next)
    expect(message.error).toHaveBeenCalledWith('cs.login.policyFailed')
    expect(next).toHaveBeenCalledWith({ path: '/user/login', query: { redirect: to.fullPath } })
    expect(store.dispatch).toHaveBeenCalledTimes(1)
  })

  it('does not erase sessions or start SSO on server failures', async () => {
    localStorage.setItem('ops_auth_type', 'OIDC')
    store.dispatch.mockRejectedValue({ response: { status: 503 } })
    await guard(to, from, next)
    expect(store.dispatch.mock.calls).toEqual([['GetInfo']])
    expect(next).toHaveBeenCalledWith(false)
    expect(setTimeout).not.toHaveBeenCalled()
  })

  it('continues normal route initialization for a valid OIDC session', async () => {
    localStorage.setItem('ops_auth_type', 'OIDC')
    store.dispatch.mockImplementation(action => Promise.resolve(
      action === 'GetInfo' ? { result: { role: ['admin'] } } : undefined
    ))
    await guard(to, from, next)
    expect(store.dispatch).toHaveBeenCalledWith('GenerateRoutes', { roles: ['admin'] })
    expect(router.addRoutes).toHaveBeenCalledWith(store.getters.appRoutes)
    expect(next).toHaveBeenCalledWith({ ...to, replace: true })
    expect(store.dispatch).not.toHaveBeenCalledWith('ResetSession')
    expect(store.dispatch).not.toHaveBeenCalledWith('Login', expect.anything())
  })

  it.each(['/user/login', '/user/logout', '/oneterm/share/rdp/example'])('leaves public route %s accessible', async path => {
    await guard({ path, fullPath: path }, from, next)
    expect(next).toHaveBeenCalledWith()
    expect(store.dispatch).not.toHaveBeenCalled()
  })
})
