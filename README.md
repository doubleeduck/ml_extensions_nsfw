# MangaLaunch Official NSFW Sources

Отдельный подписанный пакет **10 NSFW источников** для MangaLaunch.
Идентификатор расширения: `official.mangalaunch.nsfw.sources`.
Обычные источники выпускаются отдельно в `ml_extensions`. Все источники этого пакета имеют `isNsfw: true` и новые ID с сегментом `.nsfw.`.

## Источники

- **HentaiLib** — `ru.nsfw.hentailib`
- **YaoiLib** — `ru.nsfw.yaoilib`
- **AllHentai** — `ru.nsfw.allhentai`
- **Senkognito** — `ru.nsfw.senkognito`
- **IMHentai** — `all.nsfw.imhentai`
- **IMHentai** — `en.nsfw.imhentai`
- **IMHentai** — `ru.nsfw.imhentai`
- **Pururin** — `all.nsfw.pururin`
- **H-chan** — `ru.nsfw.hchan`
- **Nude Moon** — `ru.nsfw.nudemoon`

## Установка и переход

Пакеты имеют разные extensionId, sourceId и имена архивов и могут работать одновременно.
Основной пакет обновляется с сохранением прежнего extensionId. Для обновления
установленного пакета выпускайте версию выше текущей.
NSFW устанавливается отдельным расширением. Миграции в приложении нет:
записи библиотеки, история, настройки и сессии старых NSFW ID автоматически
не связываются с новыми. Повторно добавьте нужные тайтлы и войдите в аккаунты
новых источников. Старые пользовательские данные не удаляются этим репозиторием.
Сначала обновите основной пакет, чтобы убрать из каталога старые NSFW-регистрации.

См. [разделение пакетов и таблицу ID](docs/SOURCE_BUNDLE_SPLIT_RU.md).
Авторизация, WebView, cookies, защищённое хранение токенов и media-брокер остаются
в приложении. JS объявляет параметры через подписанный manifest; исходники
сайтов не включаются в приложение. Общие engines/helpers копируются в каждый
репозиторий и не требуют соседнего репозитория для сборки или исполнения.

## Разработка и сборка

Node 22+. SDK и инструменты одинакового контракта v1; `node:` imports допустимы
только в инструментах/тестах и не входят в runtime-пакет.

```powershell
npm ci
npm test
npm run build:host
node tools/pack.mjs --generate-key .keys/local-development.pem --key-id local-development
node tools/pack.mjs --key .keys/local-development.pem --key-id local-development --version 1.0.0-dev.1
```

По умолчанию архив: `dist/official.mangalaunch.nsfw.sources.mlsource`.
Для сборки без npm/Flutter: `./build-package.ps1 -KeyPath PRIVATE.pem -KeyId ID -Version SEMVER`.
Добавьте `-Repository owner/repo -IndexSerial NUMBER` для подписанного release index.
Приватные ключи, node_modules, SDK bootstrap, тесты и dist не входят в архив.
Архив проверяется packer-ом; одинаковые ключ, версия и файлы дают одинаковые байты.
Локальный ключ предназначен только для разработки и не является доверенным production-ключом.

В GitHub Actions настройте отдельный репозиторий и environment
`official-nsfw-source-release`, publisher ID и защищённый
Ed25519 signing secret. Новый namespace должен быть одобрен приложением отдельно;
public.json рядом с архивом сам по себе не устанавливает доверие.
Workflows проверяют изменения, собирают CI-архив и публикуют релиз по SemVer-тегу.

- [Контракт SDK и создание источников](docs/AUTHORING.md)
- [Проверки и выпуск](docs/BUILD_AND_RELEASE.md)
- [Сборка через PowerShell](docs/GITHUB_RELEASE_WITH_BUILD_PACKAGE.md)
- [Настройка GitHub Actions](docs/GITHUB_ACTIONS_SETUP_RU.md)

Node fixtures и offline-фабрики не заменяют живую проверку сайтов и аккаунтов.

## Лицензия

Все права защищены. См. [LICENSE](LICENSE).
