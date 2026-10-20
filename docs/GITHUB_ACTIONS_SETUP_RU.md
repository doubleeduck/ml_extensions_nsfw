> Текущий состав: 10 NSFW источников, пакет `official.mangalaunch.nsfw.sources`.
> Разделение, новые NSFW ID и переход: [SOURCE_BUNDLE_SPLIT_RU.md](SOURCE_BUNDLE_SPLIT_RU.md).

# Автоматическая сборка и публикация расширений в GitHub

Репозиторий расширений: `D:\mangalaunch\nsfw_ml_extensions`. Его содержимое должно
лежать в корне отдельного GitHub-репозитория. Лицензия: **все права защищены**.

## Что запускается автоматически

- Push в `main` и pull request: тесты, сборка SDK и проверочный пакет с временным
  CI-ключом. Артефакт хранится 7 дней. Для этого **не нужны secrets или variables**.
  Такой пакет не является официальным релизом и не должен становиться доверенным
  production-пакетом в приложении.
- Push тега `v1.0.0` или `v1.0.0-beta.1`: workflow `Protected source package release`,
  тесты, проверка тега, подпись и публикация GitHub Release. Версия берётся из тега.
- Релиз также можно запустить вручную через Actions → Protected source package release → Run workflow.
  Версию указывать без `v`; при запуске на теге она должна совпадать с тегом.

Вручную указывать или подтверждать SHA коммита не нужно. Проверяется только,
что тег версии соответствует коммиту запущенного workflow. Обычный push
в `main` не публикует релиз и не получает ключ подписи.

## 1. Настройка GitHub

Откройте репозиторий → **Settings → Environments → New environment**.
Создайте environment с точным именем **`official-nsfw-source-release`**.
Внутри него добавьте:

| Раздел | Имя | Значение |
| --- | --- | --- |
| Environment secrets | `MLSOURCE_SIGNING_KEY_BASE64` | Base64 всего файла приватного Ed25519-ключа в формате PKCS#8 PEM |
| Environment variables | `MLSOURCE_PUBLISHER_KEY_ID` | Постоянный ID издательского ключа, например `mangalaunch-official-2026` |

`GITHUB_TOKEN`, `GH_TOKEN`, имя репозитория, временный каталог runner, версия
из тега и serial индекса задаются workflow автоматически. PAT создавать не надо:
job публикации уже запрашивает `contents: write`. Если политика организации
запрещает такую запись, разрешите её для этого репозитория.

При необходимости включите Required reviewers и ограничения deployment tags
`v*`. С reviewer публикация ждёт одобрения; без reviewer запускается автоматически,
без дополнительного подтверждения коммита. Для единственного владельца не включайте запрет
самостоятельного одобрения. Защитите `main` и release-теги правилами репозитория.
Доступность environment protections зависит от тарифа и видимости репозитория.

Для установки пакетов через приложение репозиторий и release assets должны быть
публичными: приложение не передаёт личный GitHub-токен для приватных репозиториев.

## 2. Ключ подписи

Если официальный ключ уже существует, используйте его. **Не генерируйте новый
ключ для каждого релиза** и не используйте ключи из тестов, `.tmp` или CI.
Если ключа ещё нет, создайте его один раз вне Git-репозитория:

```powershell
Set-Location D:\mangalaunch\nsfw_ml_extensions
node ./tools/pack.mjs --generate-key D:/mangalaunch-private/mlsource-official.pem --key-id mangalaunch-official-2026
Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes('D:/mangalaunch-private/mlsource-official.pem')))
```

Родительская приватная папка должна существовать. Вставьте содержимое буфера в
secret `MLSOURCE_SIGNING_KEY_BASE64`, затем очистите буфер обмена. Base64 — не
шифрование. Не выводите значение в лог, чат или Git. Сохраните резервную копию
ключа под своим контролем. В репозиторий разрешено добавлять только публичную
запись издателя; соответствующему ключу нужно отдельно довериться в приложении.
Публичный файл рядом с пакетом сам по себе доверия не даёт.

## 3. Выпуск версии

1. Выполните `npm ci`, `npm test`, `npm run build:host`, проверку в приложении.
2. Закоммитьте изменения. Рабочее дерево должно быть чистым.
3. Создайте и отправьте тег на коммит с проверенной версией:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

После этого Actions автоматически проверит тег, соберёт и подпишет пакет,
создаст GitHub Release с пятью публичными файлами:

- `official.mangalaunch.nsfw.sources.mlsource`;
- `official.mangalaunch.nsfw.sources.mlsource.public.json`;
- `official.mangalaunch.nsfw.sources.mlsource.sha256`;
- `extensions-index.json`;
- `extensions-index.ed25519`.

Prerelease-версия содержит суффикс, например `v1.0.0-beta.1`. Уже опубликованные
версии и теги не перезаписывайте. Повторный `gh release create` для существующего
релиза завершится ошибкой; исправление выпускайте новой версией.

Для ручного запуска workflow должен уже находиться в default branch. Выберите
ref с нужным тегом версии. `IndexSerial` считается автоматически как
`GITHUB_RUN_NUMBER * 100 + GITHUB_RUN_ATTEMPT`; signed index действует 30 дней.
При отдельной ручной сборке не уменьшайте serial уже опубликованного индекса.

## 4. Что учтено после отделения от приложения

Тест MangaDex использует собственную совместимую fixture и больше не читает
Dart-файлы за пределами репозитория. Удалены старые npm-команды синхронизации с
монорепозиторием; `build:host` создаёт локальный SDK-артефакт, не меняя приложение.
Иконка пакета `assets/icon.png` включена в подписанный payload отдельно от логотипов
источников. Текстовые файлы нормализованы через `.gitattributes` (LF).

Для native-проверки этого пакета задайте
`--dart-define=MLSOURCE_TEST_REPOSITORY=../nsfw_ml_extensions`,
`--dart-define=MLSOURCE_TEST_EXTENSION_ID=official.mangalaunch.nsfw.sources`
и `--dart-define=MLSOURCE_TEST_NSFW=true`. По умолчанию тест проверяет основной
пакет из `../ml_extensions`. Полные команды приведены в
[описании разделения](SOURCE_BUNDLE_SPLIT_RU.md). В тестах сохранены DTO-эталоны;
старых Dart-парсеров в приложении нет.

Локальная сборка и ручная публикация через PowerShell подробно описаны в
[GITHUB_RELEASE_WITH_BUILD_PACKAGE.md](GITHUB_RELEASE_WITH_BUILD_PACKAGE.md).
Production-ключ, GitHub secrets, push тегов и публикация не выполняются автоматически
во время локальной проверки репозитория агентом.

## Документация GitHub

- [Environments и их секреты/защиты](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [Встроенный GITHUB_TOKEN](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token)
- [Ручной запуск workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
- [События запуска workflow](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
