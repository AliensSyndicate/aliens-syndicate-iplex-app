import { OnlinePage } from './online/OnlinePage'

/**
 * Frontend do iPlex. Nesta etapa, apenas a página de validação
 * "IPLEX TIZEN ONLINE"; o mesmo bundle pode ser hospedado (Firebase Hosting)
 * ou empacotado no .wgt do Tizen.
 */
function App() {
  return <OnlinePage />
}

export default App
