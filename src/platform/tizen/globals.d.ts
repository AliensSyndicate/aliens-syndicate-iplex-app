/**
 * Tipos mínimos das APIs Samsung/Tizen usadas pelo iPlex. Somente membros
 * documentados e efetivamente utilizados.
 *  - Tizen Application API: tizen.application.getCurrentApplication().exit()
 *  - Tizen SystemInfo API:  tizen.systeminfo.getCapability(key)
 *  - TVInputDevice API:     tizen.tvinputdevice (privilégio tv.inputdevice)
 *  - Samsung AVPlay API:    webapis.avplay (requer $WEBAPIS/webapis/webapis.js)
 */

interface TizenApplication {
  exit(): void
  hide(): void
}

interface TizenGlobal {
  application: {
    getCurrentApplication(): TizenApplication
  }
  systeminfo: {
    getCapability(key: string): unknown
  }
  tvinputdevice?: TizenTvInputDevice
}

interface TizenInputDeviceKey {
  name: string
  code: number
}

interface TizenTvInputDevice {
  getSupportedKeys(): TizenInputDeviceKey[]
  getKey(keyName: string): TizenInputDeviceKey | null
  registerKey(keyName: string): void
  /** Disponível desde a API 2.4 (TVs 2016+). */
  registerKeyBatch?(keyNames: string[], successCallback?: () => void, errorCallback?: (error: unknown) => void): void
}

type AVPlayPlayerState = 'NONE' | 'IDLE' | 'READY' | 'PLAYING' | 'PAUSED'
type AVPlayStreamType = 'VIDEO' | 'AUDIO' | 'TEXT'
type AVPlayDisplayMode =
  | 'PLAYER_DISPLAY_MODE_LETTER_BOX'
  | 'PLAYER_DISPLAY_MODE_FULL_SCREEN'
  | 'PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'

interface AVPlayStreamInfo {
  index: number
  type: AVPlayStreamType
  extra_info: string
}

interface AVPlayPlaybackCallback {
  onbufferingstart?: () => void
  onbufferingprogress?: (percent: number) => void
  onbufferingcomplete?: () => void
  oncurrentplaytime?: (currentTime: number) => void
  onstreamcompleted?: () => void
  onevent?: (eventType: string, eventData: string) => void
  onerror?: (eventType: string) => void
  onsubtitlechange?: (duration: string, subtitles: string, type: string, attributes: unknown) => void
}

interface AVPlayManager {
  open(url: string): void
  close(): void
  prepareAsync(successCallback?: () => void, errorCallback?: (error: unknown) => void): void
  play(): void
  pause(): void
  stop(): void
  seekTo(milliseconds: number, successCallback?: () => void, errorCallback?: (error: unknown) => void): void
  getState(): AVPlayPlayerState
  getDuration(): number
  getCurrentTime(): number
  getTotalTrackInfo(): AVPlayStreamInfo[]
  getCurrentStreamInfo(): AVPlayStreamInfo[]
  setSelectTrack(trackType: 'AUDIO' | 'TEXT', trackIndex: number): void
  setSilentSubtitle(onoff: boolean): void
  setDisplayRect(x: number, y: number, width: number, height: number): void
  setDisplayMethod(displayMode: AVPlayDisplayMode): void
  setListener(playbackCallback: AVPlayPlaybackCallback): void
}

interface WebApisGlobal {
  avplay?: AVPlayManager
}

interface Window {
  tizen?: TizenGlobal
  webapis?: WebApisGlobal
}
