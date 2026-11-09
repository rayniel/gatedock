export function webLoginProviders(auth) {
  if (typeof auth?.web_local_login_enabled !== 'boolean') return []
  const providers = auth?.enable_list || []
  return providers.filter(provider => auth?.web_local_login_enabled === false
    ? provider.auth_type === 'OIDC'
    : provider.auth_type !== 'LDAP')
}
