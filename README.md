# MangaLaunch Unofficial NSFW Extensions

Неофициальное расширение MangaLaunch: подписанный пакет **10 NSFW источников** для MangaLaunch.
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

Технические extensionId, имена архивов, publisher KeyId и GitHub environment
сохраняют прежние значения с `official` для совместимости обновлений.
Отображаемое название пакета — Unofficial Extensions.

## Документация

- [Создание источника и расширения, примеры и публикация — русский](docs/AUTHORING_RU.md)
- [Creating sources and extensions, examples and publication — English](docs/AUTHORING_EN.md)

## Установка

Добавьте GitHub-репозиторий через настройки расширений MangaLaunch либо импортируйте
подписанный `.mlsource` локально. Независимо сверьте fingerprint публичного ключа
издателя и подтвердите разрешения пакета. Обычные и NSFW-пакеты устанавливаются
раздельно; обновления используют прежние ID и ключ издателя.

## Лицензия

Все права защищены. См. [LICENSE](LICENSE).
