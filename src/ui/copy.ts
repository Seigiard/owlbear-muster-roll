import type { WINDOW_SIZE_LIMITS } from '@/core/preset';

// A window size bound from the preset rules, so the message names the range the parser checks.
type WindowRange = (typeof WINDOW_SIZE_LIMITS)[keyof typeof WINDOW_SIZE_LIMITS];

export const copy = {
  command: {
    loadPreset: 'Загрузить пресет',
    downloadPreset: 'Скачать пресет',
    loadSnapshot: 'Загрузить снимок',
    downloadSnapshot: 'Скачать снимок',
    wipe: 'Очистить всё',
    // Adds a repeat block at the end of its section.
    add: 'Добавить',
    duplicate: 'Дублировать…',
    // Confirms the count of the inline duplicate block: the menu's verb with no ellipsis, as no
    // further step follows.
    confirmDuplicate: 'Дублировать',
    delete: 'Удалить',
    linkSheet: 'Привязать лист…',
    unlinkSheet: 'Отвязать лист',
    openSheet: 'Открыть лист',
    cancel: 'Отменить',
  },
  label: {
    // The accessible name of a sheet set's "+", by the sheet set's `title`.
    addToSet: (title: string): string => `Добавить: ${title}`,
    // The accessible name of a repeat section's "Добавить", by the section's title.
    addToSection: (title: string): string => `Добавить в «${title}»`,
    // The name in the header of a sheet of a sheet set, which edits its name field.
    sheetName: 'Имя листа',
    sheetActions: 'Действия с листом',
    // The range is in the label, so sight and assistive tech both get it.
    duplicateCount: 'Количество копий (1–50)',
    // The accessible names of a repeat block's "Удалить" and "Дублировать…", with the repeat
    // block's position in its section from 1.
    deleteBlock: (n: number): string => `Удалить блок ${n}`,
    duplicateBlock: (n: number): string => `Дублировать блок ${n}…`,
    // The accessible name of a read-only check mark: its field's label and its state.
    checked: (name: string): string => `${name}: отмечено`,
    unchecked: (name: string): string => `${name}: не отмечено`,
    // The checkbox of one player's row in the access panel (UX-DR12), and its accessible name, which
    // says whose it is.
    mayEdit: 'Может править',
    mayEditFor: (name: string): string => `${name}: может править`,
    // The radio group of the access panel that picks the one owner of a sheet of a sheet set, and
    // its option for no owner (UX-DR12).
    owner: 'Его лист',
    noOwner: 'Никто',
  },
  // After the name on the tab of a sheet the player owns (UX-DR8).
  ownMark: 'вы',
  addSign: '+',
  place: {
    settings: 'Настройки',
    access: 'Доступ',
  },
  section: {
    preset: 'Пресет',
    snapshot: 'Снимок',
    roomCopy: 'Копия в комнате',
    wipe: 'Очистка',
  },
  status: {
    pending: 'Ожидает',
    readOnly: 'Только чтение',
    canEdit: 'Можно править',
    tokenLinked: 'Токен привязан',
    noToken: 'Нет токена',
  },
  loading: 'Загрузка…',
  playerNoPreset: 'ГМ ещё не настроил листы.',
  playerNoSheets: 'ГМ ещё не создал листы.',
  playerNoGmNoData: 'ГМ ещё не заходил. Листов пока нет.',
  noGm: 'Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку.',
  roomCopyNotSaved: 'Копия в комнате не сохранена. Игра идёт дальше, но скачайте снимок.',
  localSaveFailed: 'Не удалось сохранить в браузере. Скачайте снимок.',
  roomCopyUnreadable: 'Копия в комнате не читается. Дождитесь ГМ.',
  // AD-12, CAP-31: a GM's banner while the room copy is of an older format.
  roomCopyOlderFormat: 'Копия в комнате из старой версии. Очистите всё в настройках.',
  // Settings, "Копия в комнате". Sizes come in kB, as `kilobytes` writes them.
  roomCopySaved: (used: string, free: string): string =>
    `Сохранена. Занято ${used} кБ, свободно ${free} кБ.`,
  roomCopyNone: (free: string): string => `Не сохранена. Свободно ${free} кБ.`,
  newVersion: 'Вышла новая версия. Перезагрузите страницу.',
  // AD-14: the parts of the one upload confirmation, each shown when it applies, then the question.
  presetUploadErasesValues: (count: number): string =>
    `Значения удалённых полей будут стёрты: ${count}.`,
  presetUploadDeletesSheets: (sheets: number): string => `Листы будут удалены: ${sheets}.`,
  presetUploadQuestion: 'Загрузить пресет?',
  presetUploadRemovesNothing: 'Формат листов изменён.',
  snapshotImport:
    'Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?',
  snapshotImportDropsValues: (count: number): string =>
    `Не войдут значения удалённых полей: ${count}.`,
  snapshotImportDropsSheets: (sheets: number): string => `Не войдут листы: ${sheets}.`,
  // AD-9, CAP-31: the one confirmation of a wipe.
  wipeConfirmation:
    'Будут удалены пресет, все листы, копия в комнате и копия в этом браузере. Игроки потеряют привязки и права. Очистить всё?',
  // A wipe that was refused, could not be sent, or got no answer. It follows the
  // `snapshotImportFailed` pattern.
  wipeFailed: 'Не удалось очистить. Попробуйте ещё раз.',
  wipeNotAllowed: 'Очищать может только мастер.',
  deleteConfirmation: (name: string): string => `Удалить «${name}»? Это нельзя отменить.`,
  badFormula: (field: string): string => `Нельзя бросить: поле «${field}» пустое или не число`,
  badFormulaResult: 'Нельзя бросить: формула не дала числа',
  badNumber: 'Нужно число',
  badDuplicateCount: 'Нужно число от 1 до 50',
  valueTooLong: 'Слишком длинно',
  badFile: (reason: string): string => `Файл не подошёл: ${reason}. Ничего не изменено.`,
  newerFile: 'Файл из более новой версии. Перезагрузите страницу.',
  badFileReason: {
    notJson: 'это не JSON',
    invalidStructure: 'неверная структура',
    unsupportedVersion: 'неподдерживаемая версия формата',
    invalidTemplateId: (id: string): string => `недопустимый id листа «${id}»`,
    duplicateTemplate: (id: string): string => `лист «${id}» повторяется`,
    badNameField: (id: string, field: string): string =>
      `в наборе «${id}» нет текстового поля «${field}» вне повторяемых секций`,
    invalidFieldId: (id: string): string => `недопустимый id поля «${id}»`,
    duplicateFieldId: (id: string): string => `поле «${id}» повторяется`,
    badRepeat: 'в повторяемой секции нужна хотя бы одна строка хотя бы с одним полем',
    duplicateSection: (id: string): string => `две повторяемые секции с id «${id}»`,
    rowTooWide: 'в строке больше ячеек, чем колонок',
    badFormula: (formula: string): string => `ошибка в формуле «${formula}»`,
    badWindow: (width: WindowRange, height: WindowRange): string =>
      `в window нужны только width и height, целые числа: ширина от ${width.min} до ${width.max} px, высота от ${height.min} до ${height.max} px`,
    tooLarge: 'файл слишком большой',
    // A file that is not a snapshot, such as a preset, under "Загрузить снимок".
    notSnapshot: 'это не снимок',
  },
  presetRequired: 'Сначала загрузите пресет.',
  // AD-14: the stored preset does not decode, as one a newer build wrote, so no upload can run.
  presetUnreadable: 'Сохранённый пресет не читается. Обновите расширение.',
  presetWriteFailed: 'Не удалось сохранить пресет. Попробуйте ещё раз.',
  presetNotAllowed: 'Загружать пресет может только мастер.',
  // AD-9: an import that saved nothing, or got no answer. It follows the `presetWriteFailed` pattern.
  snapshotImportFailed: 'Не удалось загрузить снимок. Попробуйте ещё раз.',
  // An import whose answer never came may still have replaced the room, so the GM looks first.
  snapshotImportNoAnswer: 'Ответ не пришёл. Проверьте листы, прежде чем загружать снова.',
  snapshotImporting: 'Идёт загрузка снимка…',
  snapshotNotAllowed: 'Загружать снимок может только мастер.',
  snapshotDataReplaced: 'Данные комнаты уже заменены.',
  roll: (roller: string, sheet: string, cell: string, result: string): string =>
    `${roller}: ${sheet}, ${cell} — ${result}`,
  rollSuccess: 'успех',
  rollFailure: 'провал',
  // The one fallback label of an empty sheet name, wherever a name shows.
  unnamed: 'Без имени',
  rollFailed: 'Бросок не удался. Попробуйте ещё раз.',
  // Under a dice button while its roll waits, as for the dice extension's dice (TASK-36).
  rolling: 'Бросаем…',
  // Instead of `rolling` while the dice extension waits for the GM to allow Muster Roll (TASK-36).
  rollWaitingForGm: 'Ждём разрешения ГМ…',
  duplicateFailed: 'Не удалось дублировать. Попробуйте ещё раз.',
  // The link picker with no target to list (UX-DR22).
  noSheetsToLink: 'Сначала создайте лист',
  // Under the link picker's list when the link was not saved, such as for a sheet deleted meanwhile.
  linkFailed: 'Не удалось привязать. Попробуйте ещё раз.',
  // The link picker's offer to set the label under the token to the picked target's name, and the
  // hint under it with the label the token has now.
  linkLabel: 'Подписать токен именем листа',
  linkLabelNow: (label: string): string => `Сейчас: «${label}»`,
  linkLabelNone: 'Сейчас подписи нет',
  // An Owlbear notification when the link was saved but the label could not be set.
  linkLabelFailed: 'Не удалось подписать токен',
  // An Owlbear notification when the engine refused "Отвязать лист".
  unlinkFailed: 'Не удалось отвязать лист. Попробуйте ещё раз.',
  editDenied: 'Нет прав на правку',
  dataReplaced: 'Данные комнаты заменены',
  // In the access panel when a change was refused, could not be sent, or got no answer. It follows
  // the `duplicateFailed` pattern.
  aclFailed: 'Не удалось изменить доступ. Попробуйте ещё раз.',
  // The access panel with no player to list (UX-DR12).
  noPlayers: 'Пока никого нет',
  guestNote: 'Гость привязан к своему браузеру. Из другого браузера доступ придётся выдать снова.',
} as const;
