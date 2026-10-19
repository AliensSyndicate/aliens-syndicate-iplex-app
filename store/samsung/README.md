# Materiais da Samsung Seller Office

Coloque aqui os arquivos de loja. `npm run release:tizen` confere dimensões,
formato e tamanho de cada um.

```
store/samsung/
├── icon-512x423.png            512×423, PNG RGB (sem transparência), < 300 KB
├── logo-1920x1080.png          1920×1080, PNG RGBA (com transparência), < 300 KB
├── background-1920x1080.png    1920×1080, PNG ou JPG, < 300 KB
├── screenshots/                no mínimo 4 JPG 1920×1080 (ou 1280×720), < 500 KB cada
├── app-ui-description.*        documento no modelo da Samsung (base: docs/MAPA-DE-TELAS.md)
└── politica-de-privacidade.url URL da política de privacidade (se houver coleta de dados)
```

- Use o logo oficial do iPlex. O arquivo enviado no chat não está salvo no
  disco.
- O `tizen/icon.png` (ícone do pacote) deve ser gerado a partir do mesmo logo.
- Os screenshots devem mostrar o iPlex em uso, ou seja, as telas do iPlex Web
  dentro da TV. As telas de erro do app não servem para isso.

Especificações: [App Icons and Screenshots](https://developer.samsung.com/smarttv/design/app-icons-and-screenshots.html)
e [Launch Checklist](https://developer.samsung.com/tv-seller-office/checklists-for-distribution/launch-checklist.html).
