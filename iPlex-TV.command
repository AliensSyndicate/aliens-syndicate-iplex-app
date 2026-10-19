#!/bin/zsh
# iPlex TV — duplo clique no Finder para compilar, empacotar, instalar e abrir
# o iPlex na Samsung Tizen. Mesmo fluxo de `npm run tv` (scripts/tv.mjs).

cd "${0:A:h}" || exit 1

# Finder não carrega o PATH do Homebrew em todos os casos.
if ! command -v node >/dev/null 2>&1; then
  for prefix in /opt/homebrew/bin /usr/local/bin; do
    [[ -x "$prefix/node" ]] && export PATH="$prefix:$PATH"
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale o Node.js (ex.: brew install node)."
  status=1
else
  [[ -d node_modules ]] || npm install
  node scripts/tv.mjs "$@"
  status=$?
fi

echo
read -r "?Pressione Enter para fechar…"
exit $status
