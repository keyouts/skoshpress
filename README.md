# Skosh Press

Skosh Press is a lightweight publishing tool for creating books, zines, pamphlets, and other printed documents. It provides page-layout tools, manuscript importing, basic text editing, and PDF export in a single desktop application.

The application works locally and does not require an account or internet connection.

![Skosh Press Dashboard](https://raw.githubusercontent.com/keyouts/skoshpress/50cf5a3f67593d6499ebcb4225b4ae9396add2f5/SkoshPressDash.png)

## Features

- **Page Layout:** Create publications with custom page sizes, margins, columns, guides, and rulers.
- **Text Editing:** Import Word documents, edit text frames, adjust typography, and use find and replace.
- **Images and Fonts:** Add images and custom fonts to publications.
- **Templates:** Create reusable layouts or start with built-in templates.
- **Publishing Tools:** Export PDFs, prepare booklets, and calculate basic printing costs using Print Lab.
- **Revision Checker:** Compare publications to identify changes in text, formatting, and layout.
- **Compatibility:** Experimental Scribus export and editable manuscript export for InDesign.
- **Accessibility:** Keyboard controls, screen-reader labels, adjustable interface settings, and reduced-motion options.

## Supported Files

Skosh Press saves editable publications using the `.skoshpress` format.

Supported imports include DOCX, TXT, Markdown text, common image formats, and selected font formats. Google Docs manuscripts can be exported to DOCX before importing.

PDF, booklet PDF, Scribus `.sla`, and RTF export options are available. Interchange exports have limitations and may not preserve every element of a publication.

## Installation

Skosh Press is developed using Electron.

To run the source version, install Node.js, open a terminal in the project directory, and enter:

```bash
npm ci
npm start
```

To create a Windows installer:

```bash
npm run build
```

The installer will be generated in the `dist` directory after a successful build.

If you're using a prebuilt installer, simply run the setup executable.

## Privacy

Skosh Press processes documents locally. It does not require an account, collect usage analytics, or upload publications to a server.

See the Privacy Policy for more information.

## Known Limitations

Skosh Press is still in development. Some advanced publishing features, including professional color management and interchange compatibility, remain limited.

Spellchecking depends on available local dictionaries. PDF output and booklet layouts should be reviewed before professional printing.

Please keep backups of important projects. Automatic crash recovery is in beta.

## Development

Skosh Press is maintained by KeyOuts.

The project uses Electron, JavaScript, HTML, and CSS. Security improvements, accessibility refinements, and publishing features are ongoing.

**Version:** 0.7.5

**Developer:** KeyOuts
