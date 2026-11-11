import message from 'ant-design-vue/es/message'
import { axios } from '@/utils/request'
import { getInfo } from '@/api/login'

jest.mock('vue', () => ({ ls: { get: jest.fn() } }))
jest.mock('@/store', () => ({ state: { locale: 'zh' } }))
jest.mock('@/lang', () => ({ t: key => key }))
jest.mock('ant-design-vue/es/message', () => ({ error: jest.fn(), warning: jest.fn() }))
jest.mock('ant-design-vue/es/notification', () => ({ warning: jest.fn() }))

describe('Login session probe error messages', () => {
  const rejectResponse = axios.interceptors.response.handlers[0].rejected

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    console.warn.mockRestore()
  })

  it('rejects a session probe 401 without displaying an error toast', async () => {
    const error = {
      config: { url: '/v1/acl/users/info', skipUnauthorizedMessage: true },
      response: { status: 401, data: { message: 'Unauthorized' } }
    }
    await expect(rejectResponse(error)).rejects.toBe(error)
    expect(message.error).not.toHaveBeenCalled()
  })

  it('opts only the user info probe into quiet 401 handling', async () => {
    const adapter = jest.fn().mockResolvedValue({ data: {}, status: 200, headers: {}, config: {} })
    axios.defaults.adapter = adapter
    await getInfo()
    expect(adapter).toHaveBeenCalledWith(expect.objectContaining({
      skipUnauthorizedMessage: true,
      method: 'get'
    }))
  })

  it.each([401, 403, 500])('still displays ordinary API errors with status %s', async status => {
    const error = {
      config: { url: '/v1/acl/login' },
      response: { status, data: { message: 'Request failed' } }
    }
    await expect(rejectResponse(error)).rejects.toBe(error)
    expect(message.error).toHaveBeenCalledWith('Request failed')
  })

  it.each([403, 500])('still displays non-401 session probe errors with status %s', async status => {
    const error = {
      config: { url: '/v1/acl/users/info', skipUnauthorizedMessage: true },
      response: { status, data: { message: 'Request failed' } }
    }
    await expect(rejectResponse(error)).rejects.toBe(error)
    expect(message.error).toHaveBeenCalledWith('Request failed')
  })
})
