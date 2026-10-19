import type { PlatformId } from '../bridge/protocol'
import type { MediaPlayer } from '../player/types'

/**
 * Contrato da camada de integração com o sistema da TV (equivalente
 * conceitual da ponte nativa do Dream+TV, WebAppInterface).
 *
 * Compartilhado: não usa tipos do Tizen nem do webOS. Cada plataforma tem a
 * sua implementação em src/platform/<plataforma>/ (hoje: tizen e browser;
 * um futuro adaptador webOS entra em src/platform/webos/).
 */
export interface PlatformAdapter {
  readonly id: PlatformId
  readonly label: string
  /** Versão da plataforma informada pelo sistema, quando disponível. */
  readonly platformVersion: string | null
  /** Indica se exit() realmente encerra o aplicativo. */
  readonly canExit: boolean
  /** Indica se createPlayer() usa o player nativo da TV. */
  readonly nativePlayer: boolean
  /** Encerra o aplicativo. */
  exit(): void
  /** Cria o player de mídia da plataforma (um por vez). */
  createPlayer(): MediaPlayer
}
