import { CELL_NAME_MAX_CHARACTERS, type WINDOW_SIZE_LIMITS } from '@/core/preset';

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
    // CAP-32: a GM's toggle that selects a sheet's or a repeat block's linked tokens on the map, and
    // deselects them when it is pressed.
    selectOnMap: 'Выделить на карте',
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
    selectBlockOnMap: (n: number): string => `Выделить блок ${n} на карте`,
    // CAP-32: the accessible name of a tab or a repeat block whose linked token is selected on the
    // map. The mark itself is a dot or a bar, so the word lives in the name only.
    selectedOnMap: (name: string): string => `${name}, токен выделен`,
    // The accessible name of a read-only check mark: its field's label and its state.
    checked: (name: string): string => `${name}: отмечено`,
    unchecked: (name: string): string => `${name}: не отмечено`,
    // The checkbox of one player's row in the access panel (UX-DR12), and its accessible name,
    // which says whose it is.
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
  // AD-9: a snapshot import runs on the GM client, and nothing writes until it ends.
  wipeAfterImport: 'Идёт загрузка снимка. Очистить можно после неё.',
  deleteConfirmation: (name: string): string => `Удалить «${name}»? Это нельзя отменить.`,
  badFormula: (field: string): string => `Нельзя бросить: поле «${field}» пустое или не число`,
  badFormulaResult: 'Нельзя бросить: формула не дала числа',
  badNumber: 'Нужно число',
  badDuplicateCount: 'Нужно число от 1 до 50',
  valueTooLong: 'Слишком длинно',
  emptySelectOption: '—',
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
    noOptions: (field: string): string => `у поля «${field}» нет вариантов`,
    blankOption: (field: string): string => `пустой вариант в поле «${field}»`,
    duplicateOption: (option: string, field: string): string =>
      `вариант «${option}» повторяется в поле «${field}»`,
    blankName: (cell: 'field' | 'dice', detail: string): string =>
      `пустое название у ${cell === 'field' ? 'поля' : 'кубика'} «${detail}»`,
    longName: (cell: 'field' | 'dice', detail: string): string =>
      `название ${cell === 'field' ? 'поля' : 'кубика'} «${detail}» длиннее ${CELL_NAME_MAX_CHARACTERS} символов`,
    badDieOption: (option: string, field: string): string =>
      `вариант «${option}» в поле «${field}» не кубик вида d6`,
    dieFieldAsNumber: (formula: string, field: string): string =>
      `в формуле «${formula}» поле «${field}» — выбор кубика, бросайте его как 1d(${field})`,
    fieldNotDie: (formula: string, field: string): string =>
      `в формуле «${formula}» поле «${field}» не выбор кубика`,
    tooLarge: 'файл слишком большой',
    // A file that is not a snapshot, such as a preset, under "Загрузить снимок".
    notSnapshot: 'это не снимок',
  },
  presetRequired: 'Сначала загрузите пресет.',
  // AD-14: the stored preset does not decode, as one a newer build wrote, so no upload can run.
  presetUnreadable: 'Сохранённый пресет не читается. Обновите расширение.',
  presetWriteFailed: 'Не удалось сохранить пресет. Попробуйте ещё раз.',
  presetNotAllowed: 'Загружать пресет может только мастер.',
  // AD-9: an import that saved nothing, or got no answer. It follows the `presetWriteFailed`
  // pattern.
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
  // Under the link picker's list when the link was not saved, such as for a sheet deleted
  // meanwhile.
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
  // CAP-20 to CAP-28: the preset builder page, and its link in the window's Settings.
  builder: {
    pageName: 'Конструктор пресетов',
    settingsLink: 'Конструктор пресетов',
    settingsHint: 'Откроется в новой вкладке. Готовый файл загрузите кнопкой «Загрузить пресет».',
    draftSaved: 'Черновик сохранён',
    draftNotSaved: 'Черновик не сохраняется в этом браузере',
    undo: 'Отменить правку',
    redo: 'Повторить правку',
    problems: (n: number): string => `Проблем: ${n}`,
    problemsName: (n: number): string => `Проблем: ${n}. Перейти к первой`,
    noProblems: 'Проблем нет',
    open: 'Открыть…',
    openEmpty: 'Пустой пресет',
    openExample: 'Пример: персонажи, NPC, инвентарь',
    openD20: 'Пример: d20',
    openD6Pool: 'Пример: пул d6',
    openFile: 'Файл…',
    lightTheme: 'Светлая тема',
    downloadDisabled: 'Скачать можно, когда проблем нет.',
    replaceDraft: (name: string): string => `Черновик будет заменён. Открыть «${name}»?`,
    confirmOpen: 'Открыть',
    structure: 'Структура',
    preview: (width: number, height: number): string => `Превью · окно ${width} × ${height}`,
    addSet: 'Добавить набор',
    addSingle: 'Добавить одиночный лист',
    addSection: 'Добавить секцию',
    addRow: 'Добавить строку',
    addLabel: 'Добавить подпись',
    addField: 'Добавить поле',
    addDice: 'Добавить кубик',
    emptyPreset: 'Добавьте набор или одиночный лист.',
    formulasChanged: (n: number): string => `Формулы изменены: ${n}.`,
    fieldValuesErased: (id: string): string =>
      `Значения поля «${id}» в комнате будут стёрты при загрузке пресета.`,
    templateSheetsDeleted: (id: string): string =>
      `Листы «${id}» в комнате будут удалены при загрузке пресета.`,
    // The tree's items, by kind.
    windowItem: (width: number, height: number): string => `Окно ${width} × ${height}`,
    templateItem: (title: string, kind: string): string => `${title} · ${kind}`,
    untitledSection: 'Секция',
    rowItem: (n: number): string => `Строка ${n}`,
    fieldItem: (id: string, type: string): string => `${id} · ${type}`,
    emptyText: 'Пустая подпись',
    emptyFormula: 'Пустая формула',
    untitled: 'Без заголовка',
    dragHandle: (name: string): string => `Перетащить: ${name}`,
    expand: (name: string): string => `Развернуть или свернуть: ${name}`,
    problemMark: 'Проблема',
    // What a new item starts with.
    newSetTitle: 'Набор',
    newSingleTitle: 'Одиночный лист',
    newNameLabel: 'Имя',
    newLabel: 'Подпись',
    newFormula: '1d20',
    // Form labels, by item.
    form: {
      ownWindowSize: 'Свой размер окна',
      width: 'Ширина, px',
      height: 'Высота, px',
      windowHint:
        'Ширина от 360 до 1440, высота от 360 до 1080. Без своего размера окно 600 × 600.',
      title: 'Заголовок',
      id: 'Id',
      kind: 'Вид',
      kindSet: 'Набор',
      kindSingle: 'Одиночный лист',
      nameField: 'Поле имени',
      visibility: 'Видят',
      visibilityAll: 'Все',
      visibilityGm: 'Только ГМ',
      playersEdit: 'Игроки могут править',
      templateTokens: 'Можно привязать токен',
      sectionWidth: 'Ширина',
      widthFull: 'Вся',
      widthHalf: '1/2',
      widthThird: '1/3',
      columns: 'Колонки',
      columnsHint: 'Пусто — ячейки идут в строку.',
      repeat: 'Повторяемая',
      blockTokens: 'Можно привязать токен к блоку',
      text: 'Текст',
      fieldType: 'Тип',
      typeText: 'Текст',
      typeNumber: 'Число',
      typeCheck: 'Флажок',
      typeSelect: 'Список',
      typeDiceChoice: 'Выбор кубика',
      selectOptions: 'Варианты — по одному в строке',
      name: 'Название',
      nameHint: 'Видно в подсказке. Пусто — ячейку называет подпись перед ней.',
      defaultSelectOptionOne: 'Вариант 1',
      defaultSelectOptionTwo: 'Вариант 2',
      defaultDiceOptions: 'd4\nd6\nd8\nd10\nd12\nd20',
      fieldId: 'Id — имя для формул',
      fieldUses: (n: number): string => `Встречается в формулах: ${n}.`,
      formula: 'Формула',
      formulaHint: 'Например: 1d20 + str',
      completions: 'Поля',
    },
  },
} as const;
