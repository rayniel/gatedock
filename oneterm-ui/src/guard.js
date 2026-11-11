import Vue from 'vue'
import router from './router'
import store from './store'

import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { setDocumentTitle, domTitle } from '@/utils/domUtil'
import { ACCESS_TOKEN } from './store/global/mutation-types'
import i18n from '@/lang'
import { webLoginProviders } from '@/utils/webLoginPolicy'
import { message } from 'ant-design-vue'

NProgress.configure({ showSpinner: false })

// pages that do not require authentication
const whitePath = [
  '/user/login',
  '/user/logout',
  '/user/register',
  '/api/sso/login',
  '/api/sso/logout',
  '/user/forgetPassword'
]
const startsMathWhitePath = ['/oneterm/share']

async function redirectToLogin(to, next) {
  try {
    await store.dispatch('GetAuthDataEnable')
  } catch (error) {
    message.error(i18n.t('cs.login.policyFailed'))
    next({ path: '/user/login', query: { redirect: to.fullPath } })
    return
  }
  const auth = store.state.user.auth_enable
  const providers = webLoginProviders(auth)
  if (providers.length === 1 && auth.auth_auto_redirect) {
    await store.dispatch('Login', { userInfo: {}, auth_type: providers[0].auth_type })
    NProgress.done()
    next(false)
    return
  }
  next({
    path: providers.length === 1 ? '/user/logout' : '/user/login',
    query: { redirect: to.fullPath }
  })
}

router.beforeEach(async (to, from, next) => {
  NProgress.start() // start progress bar
  to.meta && (!!to.meta.title && setDocumentTitle(`${i18n.t(to.meta.title)} - ${domTitle}`))

  const auth_type = localStorage.getItem('ops_auth_type')
  if (
    whitePath.includes(to.path) ||
    startsMathWhitePath.some((path) => to?.path?.startsWith?.(path) || false)
  ) {
    next()
  } else if ((auth_type || (!auth_type && Vue.ls.get(ACCESS_TOKEN))) && store.getters.roles.length === 0) {
    return store.dispatch('GetInfo').then(res => {
      store.dispatch('GetAuthDataEnable').catch(() => {
        message.error(i18n.t('cs.login.policyFailed'))
      })
      const roles = res.result && res.result.role
      store.dispatch('loadAllUsers')
      store.dispatch('loadAllEmployees')
      store.dispatch('loadAllDepartments')
      store.dispatch('GenerateRoutes', { roles }).then(() => {
        router.addRoutes(store.getters.appRoutes)
        const redirect = decodeURIComponent(from.query.redirect || to.path)
        if (to.path === redirect) {
          // Ensure addRoutes is complete, set replace: true so navigation will not leave a history record
          next({ ...to, replace: true })
        } else {
          // Redirect to the target route
          next({ path: redirect })
        }
      })
    }).catch(async (error) => {
      if (error.response?.status === 401) {
        await store.dispatch('ResetSession')
        await redirectToLogin(to, next)
      } else {
        NProgress.done()
        next(false)
      }
    })
  } else if (to.path === '/user/login' && !auth_type && store.getters.roles.length !== 0) {
    next({ path: '/' })
  } else if (!auth_type && !Vue.ls.get(ACCESS_TOKEN) && to.path !== '/user/login') {
    await redirectToLogin(to, next)
  } else {
    next()
  }
})

router.afterEach(() => {
  NProgress.done()
})
