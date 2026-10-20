# Разделение пакетов источников

С 20.10.2026 источники разделены по признаку `isNsfw`.
Классификация MintManga исправлена по указанию владельца: это обычный источник.
Обычный каталог: 20 источников, `official.mangalaunch.sources`, репозиторий `ml_extensions`.
NSFW-каталог: 10 источников, `official.mangalaunch.nsfw.sources`, репозиторий `nsfw_ml_extensions`.
MintManga, MangaChan и MangaShi находятся в основном пакете. MintManga сохраняет
прежний ID `ru.mintmanga`; NSFW ID для него не используется.

## ID и совместимость

По решению владельца миграция в приложении не реализуется. У обычных источников
sourceId и extensionId сохранены. Всем NSFW-источникам назначены новые sourceId:

| Прежний ID общего пакета | Новый ID NSFW-пакета |
| --- | --- |
| ru.hentailib | ru.nsfw.hentailib |
| ru.yaoilib | ru.nsfw.yaoilib |
| ru.allhentai | ru.nsfw.allhentai |
| ru.senkognito | ru.nsfw.senkognito |
| all.imhentai | all.nsfw.imhentai |
| en.imhentai | en.nsfw.imhentai |
| ru.imhentai | ru.nsfw.imhentai |
| all.pururin | all.nsfw.pururin |
| ru.hchan | ru.nsfw.hchan |
| ru.nudemoon | ru.nsfw.nudemoon |

Приложение сохраняет владение прежними sourceId даже после удаления пакета.
Новые NSFW ID не пересекаются с ними, поэтому обход проверки ownership и
изменение журнала приложения не нужны. Старые записи библиотеки, история,
прогресс, загрузки, настройки, cookies и токены не переименовываются и
автоматически не привязываются к новым ID. Повторно добавьте нужные тайтлы
и авторизуйтесь в новых источниках. Данные обычных источников сохраняют свои ключи.

Порядок перехода: выпустить и установить основное расширение версии выше
установленной (с прежним release-ключом), затем установить отдельный NSFW-пакет
и одобрить его publisher/grants. Старый общий пакет иначе продолжит показывать
старые NSFW-источники наряду с новыми. Ранее выпущенные GitHub-архивы и старые
локальные dist-файлы сами по себе не изменяются.

## Что перенесено

Отдельные модули IMHentai, Pururin, Nude Moon, их тесты и NSFW-иконки удалены из
основного репозитория. Они включены в NSFW-проект. Общие движки LibGroup, GroupLe,
Senkuro и Chan нужны обоим пакетам и находятся в каждом: изменения их общих
алгоритмов следует проверять в обоих репозиториях. Общий SDK, schema, шаблон,
packer, инструменты подписи и workflows скопированы без runtime-зависимости от
соседнего проекта. node_modules, Git-история, старые архивы и приватные ключи
не копируются. В архиве только используемый runtime-граф, LICENSE и свои иконки.

Сетевые параметры, SSO URL AllHentai, теги/множественный выбор Nude Moon,
кеширование Details/Chapters, настройки и лимиты источников сохранены.
Проверки sourceId внутри движков нового пакета обновлены на новые ID.
Авторизация, WebView и защищённое хранение остаются в приложении. Production-код
приложения не меняется; его opt-in тесты умеют проверять оба отдельных пакета.

## Независимая сборка и выпуск

Для текущего репозитория: `npm ci`, `npm test`, `npm run build:host`.
Архивы по умолчанию:

- `ml_extensions/dist/official.mangalaunch.sources.mlsource`;
- `nsfw_ml_extensions/dist/official.mangalaunch.nsfw.sources.mlsource`.

Каждый build-package.ps1 формирует свой архив, public.json и sha256, а с
-Repository и -IndexSerial — ещё extensions-index.json и extensions-index.ed25519.
Подписанные индексы публикуются в разных GitHub-репозиториях. Release workflow
NSFW использует environment `official-nsfw-source-release`; основной —
`official-source-release`. Секреты/переменные настраиваются отдельно в каждом.
Приватный ключ нового пакета не создаёт доверие сам: приложению надо явно
одобрить соответствующий publisher и новый extension namespace.

## Native-проверка в приложении

После сборки архивов запустите из репозитория приложения (Windows):

```powershell
flutter test --no-pub --dart-define=MLSOURCE_NATIVE_TESTS=true test/features/extensions/official_package_native_test.dart
flutter test --no-pub --dart-define=MLSOURCE_NATIVE_TESTS=true --dart-define=MLSOURCE_TEST_REPOSITORY=../nsfw_ml_extensions --dart-define=MLSOURCE_TEST_EXTENSION_ID=official.mangalaunch.nsfw.sources --dart-define=MLSOURCE_TEST_NSFW=true test/features/extensions/official_package_native_test.dart
```

Для opt-in live Nude Moon добавьте MLSOURCE_LIVE_TESTS=true,
MLSOURCE_LIVE_IDS=ru.nsfw.nudemoon и путь test/features/extensions/official_live_catalog_smoke_test.dart.
Тесты используют пустое хранилище, не сессии установленного приложения.
## Результат локальных проверок (20.10.2026)

- Основной пакет: 98 Node-тестов; NSFW: 65 Node-тестов, без пропусков.
- Оба SDK bootstrap собраны независимо и совпадают по SHA-256.
- Подпись, manifest и все 20/10 фабрик проверены приложением в Windows LPAC.
- Живой ru.nsfw.nudemoon: каталог, 90 тегов, множественный выбор, сведения,
  глава, 25 reader-страниц и загрузка обложки/первой страницы через media broker.
- flutter analyze: замечаний нет. Production-код приложения не изменялся.
- Локальные QA-архивы версии 1.0.0-dev.split.2: основной 45 payload-файлов,
  NSFW 25. Они подписаны временным development-ключом для проверки,
  не являются production-релизами и не опубликованы.
