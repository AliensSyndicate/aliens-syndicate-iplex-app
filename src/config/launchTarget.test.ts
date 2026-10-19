import { describe, expect, it } from 'vitest'
import { LaunchConfigError, resolveLaunchTarget } from './launchTarget'

describe('resolveLaunchTarget', () => {
  it('aceita HTTPS e normaliza a barra final de diretório', () => {
    const target = resolveLaunchTarget('https://iplex-2c8fc.web.app/apps/iplex')
    expect(target).toEqual({
      kind: 'remote',
      url: 'https://iplex-2c8fc.web.app/apps/iplex/',
      origin: 'https://iplex-2c8fc.web.app',
      host: 'iplex-2c8fc.web.app',
      manifestUrl: 'https://iplex-2c8fc.web.app/apps/iplex/iplex-web.json',
    })
  })

  it('URL de produção na raiz do site iplex-2c8fc', () => {
    expect(resolveLaunchTarget('https://iplex-2c8fc.web.app')).toMatchObject({
      url: 'https://iplex-2c8fc.web.app/',
      manifestUrl: 'https://iplex-2c8fc.web.app/iplex-web.json',
    })
  })

  it('mantém o arquivo quando o destino aponta para um arquivo', () => {
    const target = resolveLaunchTarget('http://192.168.15.47:8765/index.html', { allowInsecure: true })
    expect(target).toMatchObject({ url: 'http://192.168.15.47:8765/index.html', manifestUrl: 'http://192.168.15.47:8765/iplex-web.json' })
  })

  it('recusa HTTP sem a permissão de desenvolvimento', () => {
    expect(() => resolveLaunchTarget('http://iplex-2c8fc.web.app/apps/iplex/')).toThrow(LaunchConfigError)
  })

  it('recusa outros esquemas', () => {
    expect(() => resolveLaunchTarget('ftp://iplex-2c8fc.web.app/')).toThrow(LaunchConfigError)
  })

  it('trata caminho relativo como conteúdo empacotado', () => {
    expect(resolveLaunchTarget('./index.html')).toEqual({ kind: 'local', url: './index.html' })
  })

  it('recusa destino vazio', () => {
    expect(() => resolveLaunchTarget('  ')).toThrow(LaunchConfigError)
  })
})
