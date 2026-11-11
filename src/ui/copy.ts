import type { WINDOW_SIZE_LIMITS } from '@/core/preset';

// A window size bound from the preset rules, so the message names the range the parser checks.
type WindowRange = (typeof WINDOW_SIZE_LIMITS)[keyof typeof WINDOW_SIZE_LIMITS];

export const copy = {
  command: {
    loadPreset: 'Загрузить пресет',
    downloadPreset: 'Скачать пресет',
    loadSnapshot: 'Загрузить снимок',
    downloadSnapshot: 'Скачать снимок',
    addNpc: 'Добавить NPC',
    addRow: 'Добавить строку',
    duplicate: 'Дублировать…',
    // Confirms the count of the inline duplicate block: the menu's verb with no ellipsis, as no
    // further step follows.
    confirmDuplicate: 'Дублировать',
    delete: 'Удалить',
    linkSheet: 'Привязать лист…',
    unlinkSheet: 'Отвязать лист',
    openSheet: 'Открыть лист',
    cancel: 'Отменить',
    addCharacter: 'Добавить персонажа',
  },
  label: {
    sheetName: 'Имя персонажа',
    npcName: 'Имя NPC',
    sheetActions: 'Действия с листом',
    // The range is in the label, so sight and assistive tech both get it.
    duplicateCount: 'Количество копий (1–50)',
    // The accessible name of a repeat row's "Удалить", with the row's position from 1.
    deleteRow: (n: number): string => `Удалить строку ${n}`,
    // The accessible name of a read-only check mark: its field's label and its state.
    checked: (name: string): string => `${name}: отмечено`,
    unchecked: (name: string): string => `${name}: не отмечено`,
    // The checkbox of one player's row in the access panel (UX-DR12), and its accessible name, which
    // says whose it is.
    mayEdit: 'Может править',
    mayEditFor: (name: string): string => `${name}: может править`,
    // The radio group of the access panel that picks the one owner of a character, and its option
    // for no owner (UX-DR12).
    owner: 'Его персонаж',
    noOwner: 'Никто',
  },
  // After the name on the tab of a character the player owns (UX-DR8).
  ownMark: 'вы',
  newCharacter: 'Новый персонаж',
  newNpc: 'Новый NPC',
  addSign: '+',
  place: {
    settings: 'Настройки',
    access: 'Доступ',
    npc: 'NPC',
  },
  section: {
    preset: 'Пресет',
    snapshot: 'Снимок',
    roomCopy: 'Копия в комнате',
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
  playerNoCharacters: 'ГМ ещё не создал персонажей.',
  playerNoGmNoData: 'ГМ ещё не заходил. Листов пока нет.',
  noGm: 'Нет связи с ГМ. Правки ждут его и пропадут, если закрыть вкладку.',
  roomCopyNotSaved: 'Копия в комнате не сохранена. Игра идёт дальше, но скачайте снимок.',
  localSaveFailed: 'Не удалось сохранить в браузере. Скачайте снимок.',
  roomCopyUnreadable: 'Копия в комнате не читается. Дождитесь ГМ.',
  // Settings, "Копия в комнате". Sizes come in kB, as `kilobytes` writes them.
  roomCopySaved: (used: string, free: string): string =>
    `Сохранена. Занято ${used} кБ, свободно ${free} кБ.`,
  roomCopyNone: (free: string): string => `Не сохранена. Свободно ${free} кБ.`,
  newVersion: 'Вышла новая версия. Перезагрузите страницу.',
  presetUploadRemovesValues: (count: number): string =>
    `Значения удалённых полей будут стёрты: ${count}. Загрузить пресет?`,
  presetUploadRemovesNothing: 'Формат листов изменён.',
  snapshotImport:
    'Все данные комнаты будут заменены. Игроки потеряют привязки и права. Загрузить снимок?',
  snapshotImportDropsValues: (count: number): string =>
    `Не войдут значения удалённых полей: ${count}.`,
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
    invalidFieldId: (id: string): string => `недопустимый id поля «${id}»`,
    duplicateFieldId: (id: string): string => `поле «${id}» повторяется`,
    badRepeat: 'в повторяемой секции нужна одна строка хотя бы с одним полем',
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
  // The link picker with no sheet to list (UX-DR22).
  noSheetsToLink: 'Сначала создайте лист',
  // Under the link picker's list when the link was not saved, such as for a sheet deleted meanwhile.
  linkFailed: 'Не удалось привязать. Попробуйте ещё раз.',
  // The link picker's offer to set the label under the token to the picked sheet's name, and the
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
