/** Logotipo tipográfico do iPlex ("i" peso 500, "Plex" peso 800), como no app Flutter. */
export function IplexWordmark({ className }: { className?: string }) {
  return (
    <span className={className ? `iplex-wordmark ${className}` : 'iplex-wordmark'}>
      <span className="iplex-wordmark-i">i</span>
      <span className="iplex-wordmark-plex">Plex</span>
    </span>
  )
}
