// Same visual template as server-client/src/client-closed/closed/index.html (same fonts, colors,
// logo, layout) - kept as a plain string builder here rather than a static file because the
// title/message change per selected reason and this also adds a wiki link the original page
// doesn't have.
export function renderUnavailablePage({ title, message }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LegacyShell - ${title}</title>
    <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />

    <meta name="description" content="${message}">
    <meta property="og:title" content="LegacyShell - ${title}">
    <meta property="og:description" content="${message}">
    <meta property="og:image" content="/icon.png">
    <meta name="twitter:card" content="summary_large_image">

    <link href="https://fonts.googleapis.com/css?family=Sigmar+One|Nunito:400,600,700,900" rel="stylesheet">

    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Nunito', sans-serif;
            background-color: #AC9987;
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }

        header {
            margin-bottom: 50px;
        }

        img.logo {
            width: 400px;
            height: auto;
        }

        .message {
            font-size: 28px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 30px;
        }

        .links {
            display: flex;
            gap: 16px;
        }

        .action-link {
            display: inline-flex;
            align-items: center;
            text-decoration: none;
            color: #fff;
            font-weight: 600;
            font-size: 20px;
            padding: 10px 20px;
            border-radius: 8px;
            transition: background-color 0.3s ease;
        }

        .discord-link { background-color: #7289DA; }
        .discord-link:hover { background-color: #5b6eae; }

        .wiki-link { background-color: #8a7563; }
        .wiki-link:hover { background-color: #6f5d4f; }

        .action-link img {
            width: 30px;
            height: 30px;
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <header>
        <img src="/img/logo.png" alt="LegacyShell Logo" class="logo">
    </header>

    <div class="message">
        ${message}
    </div>

    <div class="links">
        <a href="/wiki/" class="action-link wiki-link">
            <img src="/img/wikiIcon.png" alt="Wiki icon">
            Browse the wiki
        </a>
        <a href="/discord" class="action-link discord-link">
            <img src="/img/discordLogo.png" alt="Discord Logo">
            Join our Discord
        </a>
    </div>
</body>
</html>
`;
}
