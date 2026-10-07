(function () {
  "use strict";

  const { types, styles, characters, backgrounds } = window.APP_DATA;
  const { portraits, scenes: sceneClues, roles: roleClues } = window.MYSTERY_DATA;
  const state = { typeId: null, styleId: null, characterId: null, backgroundId: null };
  let revealed = false;
  let expandedStep = 0;
  let revealSoundPending = false;
  const stylePreviewCharacters = {
    F3D: "F01",
    F2D: "F04",
    FCLAY: "F13",
    FWATERCOLOR: "F16",
    B3D: "B_WIND_SKATER",
    BANIME: "B_FOREST_TRACKER_ANIME",
    BCLAY: "B_OCEAN_EXPLORER_CLAY",
    BWATERCOLOR: "B_ELEMENTAL_MAGE_WATERCOLOR",
    PANIME: "P_PIKACHU_ANIME",
    P3D: "P_CHARIZARD_3D",
    PCLAY: "P_EEVEE_CLAY",
    PWATERCOLOR: "P_MEWTWO_WATERCOLOR",
    M3D: "M_AZURE_KNIGHT",
    MANIME: "M_CRIMSON_DRAGON_ANIME",
    MTOY: "M_AMBER_TITAN_TOY",
    MCOMIC: "M_ONYX_PANTHER_COMIC",
  };

  const elements = {
    homeScreen: document.querySelector("#home-screen"),
    experienceHeader: document.querySelector("#experience-header"),
    startButton: document.querySelector("#start-button"),
    homeButton: document.querySelector("#home-button"),
    workspace: document.querySelector(".workspace"),
    typeOptions: document.querySelector("#type-options"),
    styleSection: document.querySelector("#style-section"),
    styleOptions: document.querySelector("#style-options"),
    styleHint: document.querySelector("#style-hint"),
    characterSection: document.querySelector("#character-section"),
    characterOptions: document.querySelector("#character-options"),
    characterHint: document.querySelector("#character-hint"),
    backgroundSection: document.querySelector("#background-section"),
    backgroundOptions: document.querySelector("#background-options"),
    backgroundHint: document.querySelector("#background-hint"),
    promptCard: document.querySelector("#prompt-card"),
    prompt: document.querySelector("#prompt-heading"),
    combinationId: document.querySelector("#combination-id"),
    revealButton: document.querySelector("#reveal-button"),
    resetButton: document.querySelector("#reset-button"),
    scene: document.querySelector("#scene"),
    backgroundImage: document.querySelector("#background-image"),
    characterImage: document.querySelector("#character-image"),
    resultSummary: document.querySelector("#result-summary"),
    resultCharacter: document.querySelector("#result-character"),
    resultBackground: document.querySelector("#result-background"),
    resultStyle: document.querySelector("#result-style"),
    status: document.querySelector("#status-message"),
    recipePanel: document.querySelector("#recipe-panel"),
    recipeType: document.querySelector("#recipe-type"),
    recipeStyle: document.querySelector("#recipe-style"),
    recipeCharacter: document.querySelector("#recipe-character"),
    recipeBackground: document.querySelector("#recipe-background"),
    recipeAction: document.querySelector("#recipe-action"),
    recipeQuestion: document.querySelector("#recipe-question"),
    recipeProgress: document.querySelector("#recipe-progress"),
    recipeCaption: document.querySelector("#recipe-caption"),
    resultHeading: document.querySelector("#result-heading"),
    resultActions: document.querySelector("#result-actions"),
    changeSceneButton: document.querySelector("#change-scene-button"),
    reduceMotion: document.querySelector("#reduce-motion"),
  };
  const stepElements = ["type", "style", "character", "background", "reveal"]
    .map((name) => document.querySelector(`#step-${name}`));
  const choiceKeys = ["type", "style", "character", "background"];
  const choiceSections = choiceKeys.map((key) => ({
    key,
    section: document.querySelector(`#${key}-section`),
    options: document.querySelector(`#${key}-options`),
    hint: document.querySelector(`#${key}-hint`),
    selection: document.querySelector(`#${key}-selection`),
    edit: document.querySelector(`#${key}-edit`),
  }));

  const findById = (items, id) => items.find((item) => item.id === id);
  const selectedCharacter = () => findById(characters, state.characterId);
  const selectedBackground = () => findById(backgrounds, state.backgroundId);
  const availableStyles = () => styles.filter((item) => item.typeId === state.typeId);
  const availableCharacters = () => characters.filter((item) => item.typeId === state.typeId && item.styleId === state.styleId);
  const availableBackgrounds = (character = selectedCharacter()) => character
    ? backgrounds.filter((item) => character.scenes ? Boolean(character.scenes[item.id]) : item.typeId === character.typeId)
    : [];

  const promptText = window.APP_HELPERS.buildPrompt;
  const pendingScene = () => selectedCharacter()?.scenes?.[state.backgroundId]?.available === false;

  function previewFor(character, kind) {
    const crop = portraits[character?.id];
    return crop ? { image: crop.image, crop, kind } : {};
  }

  function scenePreviewFor(character, background) {
    const scene = character.scenes?.[background.id];
    const crop = window.SCENE_PREVIEWS?.[character.id]?.[background.id];
    // A reviewed crop belongs to one exact result, including its character and style.
    // Never fall back to the uncropped image, which would expose the protagonist.
    return crop && crop.image === scene?.image
      ? { image: scene.image, crop, kind: "scene-sample" }
      : {};
  }

  function createOption(item, group, onSelect, preview = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-button";
    button.dataset.optionId = item.id;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `${group}：${item.name}，${item.note}`);
    if (preview.image) {
      button.classList.add("option-with-preview");
      if (preview.kind === "character-sample") button.classList.add("option-character");
      const image = document.createElement("img");
      image.className = "option-preview";
      image.src = preview.image;
      image.alt = "";
      image.draggable = false;
      image.loading = "lazy";
      if (preview.crop) {
        const frame = document.createElement("span");
        frame.className = `preview-frame ${preview.kind}`;
        const cropWindow = document.createElement("span");
        cropWindow.className = preview.kind === "scene-sample" ? "scene-window" : "portrait-window";
        const { x, y, w, h } = preview.crop;
        image.style.setProperty("--crop-width", `${100 / w}%`);
        image.style.setProperty("--crop-height", `${100 / h}%`);
        image.style.setProperty("--crop-left", `${-100 * x / w}%`);
        image.style.setProperty("--crop-top", `${-100 * y / h}%`);
        cropWindow.append(image);
        frame.append(cropWindow);
        button.append(frame);
      } else {
        button.append(image);
      }
    }
    if (preview.clue) {
      button.classList.add("option-clue");
      button.dataset.tone = preview.clue.tone;
      const top = document.createElement("span");
      top.className = "clue-top";
      const icon = document.createElement("img");
      icon.className = "clue-icon";
      icon.src = `assets/mystery-icons/${preview.clue.icon}`;
      icon.alt = "";
      const label = document.createElement("span");
      label.textContent = `冒險線索 ${String(preview.index + 1).padStart(2, "0")}`;
      top.append(icon);
      top.append(label);
      button.append(top);
    }
    const copy = document.createElement("span");
    copy.className = "option-copy";
    copy.innerHTML = `<span class="option-title"></span><span class="option-note"></span>`;
    button.append(copy);
    button.querySelector(".option-title").textContent = item.roleName || item.name;
    button.querySelector(".option-note").textContent = item.note;
    if (preview.caption) {
      const caption = document.createElement("span");
      caption.className = "option-caption";
      caption.textContent = preview.caption;
      copy.append(caption);
      button.setAttribute("aria-label", `${group}：${item.roleName || item.name}，${preview.caption}，${item.note}`);
    }
    button.addEventListener("click", () => onSelect(item.id));
    return button;
  }

  function renderFixedOptions() {
    types.forEach((item) => elements.typeOptions.append(createOption(item, "角色類型", selectType)));
  }

  function renderStyleOptions() {
    elements.styleOptions.replaceChildren();
    availableStyles().forEach((item) => {
      const matching = characters.filter((character) => character.styleId === item.id);
      const representative = matching.find((character) => character.id === stylePreviewCharacters[item.id]) || matching[0];
      const preview = previewFor(representative, "style-sample");
      elements.styleOptions.append(createOption(item, "風格", selectStyle, preview));
    });
    elements.styleHint.textContent = state.typeId === "female"
      ? "看造型特寫，比較 3D、日系、Q 版黏土與水彩的線條和材質。"
      : state.typeId === "pokemon"
        ? "看不同寶可夢的造型特寫，選擇喜歡的線條、材質與色彩。"
        : state.typeId === "mecha"
          ? "比較精緻 3D、日系動畫、Q 版模型與美式漫畫，再選擇你的機甲夥伴。"
          : "看造型特寫，比較 3D、日系、Q 版黏土與水彩的線條和材質。";
  }

  function renderCharacterOptions() {
    elements.characterOptions.replaceChildren();
    const options = availableCharacters();
    elements.characterHint.textContent = `看造型、讀能力，從 ${options.length} 位夥伴中選一位；冒險動作稍後揭曉。`;
    options.forEach((item) => {
      const clue = roleClues[item.roleId];
      const option = clue ? { ...item, note: clue.ability } : item;
      elements.characterOptions.append(createOption(option, "角色", selectCharacter, {
        ...previewFor(item, "character-sample"),
        caption: clue?.tool || findById(styles, item.styleId).name,
      }));
    });
  }

  function renderBackgroundOptions() {
    elements.backgroundOptions.replaceChildren();
    const character = selectedCharacter();
    availableBackgrounds(character).forEach((item) => elements.backgroundOptions.append(createOption(item, "場景", selectBackground, {
      ...scenePreviewFor(character, item),
      caption: character.scenes?.[item.id].available === false ? "此組合圖片待補齊" : "場景局部預覽（不含主角）",
    })));
    elements.backgroundHint.textContent = "先看沒有主角的場景預覽，再選擇冒險地點。預覽取自最後揭曉的同一張圖片，場景與畫風都一致。";
  }

  function updateRecipe() {
    const type = findById(types, state.typeId);
    const style = findById(styles, state.styleId);
    const character = selectedCharacter();
    const background = selectedBackground();
    const slots = [
      [elements.recipeType, type?.name],
      [elements.recipeStyle, style?.name],
      [elements.recipeCharacter, character?.roleName || character?.name],
      [elements.recipeBackground, background?.name],
    ];
    slots.forEach(([element, value]) => {
      element.textContent = value || "等你選擇";
      element.dataset.filled = String(Boolean(value));
    });
    const count = slots.filter(([, value]) => value).length;
    elements.recipeProgress.textContent = `已選 ${count}／4`;
    elements.recipeCaption.textContent = [
      "先選一種角色類型，開始組合你的冒險。",
      "你的冒險有了方向！接著選一種喜歡的畫風。",
      "畫風選好了！哪位夥伴要加入這次冒險？",
      "夥伴準備好了！選一張場景線索卡，決定接下來的任務。",
      "四個選擇都到齊了！讀讀提示詞，先在心裡想像畫面。",
    ][count];
    elements.recipeAction.textContent = character && background
      ? character.scenes?.[background.id]?.action || background.note
      : "選好角色與場景，就會出現這次的冒險動作。";
    elements.recipeQuestion.textContent = background
      ? sceneClues[background.id]?.question || "你想像的冒險畫面會是什麼樣子？"
      : "完整畫面會在最後揭曉。你想展開什麼冒險？";
  }

  function updateStepIndicators() {
    const active = revealed ? 4 : expandedStep;
    stepElements.forEach((element, index) => {
      element.classList.toggle("is-active", index === active);
      element.classList.toggle("is-complete", index < 4 && Boolean(state[`${choiceKeys[index]}Id`]) && index !== active);
      if (index === active) element.setAttribute("aria-current", "step");
      else element.removeAttribute("aria-current");
    });
  }

  function nextIncompleteStep() {
    const index = choiceKeys.findIndex((key) => !state[`${key}Id`]);
    return index < 0 ? 4 : index;
  }

  function updateChoiceSections() {
    const values = [findById(types, state.typeId)?.name, findById(styles, state.styleId)?.name,
      selectedCharacter()?.roleName, selectedBackground()?.name];
    choiceSections.forEach((item, index) => {
      const available = index === 0 || Boolean(state[`${choiceKeys[index - 1]}Id`]);
      const expanded = available && expandedStep === index;
      item.section.hidden = !available;
      item.section.classList.toggle("is-current", expanded);
      item.section.classList.toggle("is-collapsed", available && !expanded);
      item.options.hidden = !expanded;
      item.hint.hidden = !expanded;
      item.selection.hidden = expanded || !values[index];
      item.selection.textContent = values[index] || "";
      item.edit.hidden = !values[index];
      item.edit.textContent = expanded ? "完成" : "更改";
      item.edit.setAttribute("aria-expanded", String(expanded));
      item.edit.setAttribute("aria-label", `${expanded ? "完成" : "更改"}${["角色類型", "圖片風格", "角色", "場景線索"][index]}：${values[index] || ""}`);
    });
  }

  function focusCurrentChoice() {
    if (expandedStep < 4) {
      choiceSections[expandedStep].options.querySelector("button")?.focus({ preventScroll: true });
      choiceSections[expandedStep].section.scrollIntoView({ behavior: "auto", block: "nearest" });
    } else {
      elements.revealButton.focus({ preventScroll: true });
      elements.revealButton.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
  }

  function editChoice(index) {
    if (!state[`${choiceKeys[index]}Id`]) return;
    expandedStep = expandedStep === index ? nextIncompleteStep() : index;
    hideResult("可以更改這一步；選擇不同項目時，才會重新選擇後面的內容。");
    updateProgress();
    focusCurrentChoice();
  }

  function finishSelection(message, changed) {
    expandedStep = nextIncompleteStep();
    hideResult(message);
    updateProgress();
    if (changed) window.ADVENTURE_AUDIO?.confirm();
    focusCurrentChoice();
  }

  function updatePressedState() {
    const selected = new Set(Object.values(state));
    document.querySelectorAll("[data-option-id]").forEach((button) => {
      button.setAttribute("aria-pressed", String(selected.has(button.dataset.optionId)));
    });
  }

  function hideResult(message = "") {
    revealed = false;
    revealSoundPending = false;
    window.ADVENTURE_AUDIO?.cancelReveal();
    elements.workspace.classList.remove("has-result");
    elements.scene.classList.remove("is-revealed", "is-complete-scene");
    elements.scene.hidden = true;
    elements.recipePanel.hidden = false;
    elements.resultActions.hidden = true;
    elements.revealButton.hidden = false;
    elements.resultHeading.textContent = "我的冒險配方";
    elements.backgroundImage.removeAttribute("src");
    elements.backgroundImage.alt = "";
    elements.characterImage.removeAttribute("src");
    elements.characterImage.alt = "";
    elements.resultCharacter.textContent = "";
    elements.resultBackground.textContent = "";
    elements.resultStyle.textContent = "";
    elements.resultSummary.hidden = true;
    elements.status.textContent = pendingScene() ? "此組合目前尚無圖片，完整提示詞仍可閱讀。" : message;
    updateStepIndicators();
  }

  function updateProgress() {
    updateChoiceSections();
    const complete = Boolean(state.characterId && state.backgroundId);
    elements.promptCard.hidden = !complete;
    elements.revealButton.hidden = revealed;
    elements.revealButton.disabled = !complete || pendingScene();
    const remaining = choiceKeys.filter((key) => !state[`${key}Id`]).length;
    elements.revealButton.textContent = pendingScene() ? "圖片待補齊" : complete ? "揭曉我的冒險！" : `還差 ${remaining} 個選擇，即可揭曉`;

    if (complete) {
      const character = selectedCharacter();
      const background = selectedBackground();
      elements.prompt.textContent = promptText(character, background);
      elements.combinationId.textContent = `${character.id}-${background.id}`;
    } else {
      elements.prompt.textContent = "";
      elements.combinationId.textContent = "";
    }
    updatePressedState();
    updateRecipe();
    updateStepIndicators();
  }

  function selectType(id) {
    if (!findById(types, id)) return;
    const changed = state.typeId !== id;
    if (changed) {
      Object.assign(state, { typeId: id, styleId: null, characterId: null, backgroundId: null });
      elements.characterOptions.replaceChildren();
      elements.backgroundOptions.replaceChildren();
      renderStyleOptions();
    }
    finishSelection(changed ? "已選擇角色類型，請繼續選擇圖片風格。" : "保留原本的角色類型與後續選擇。", changed);
  }

  function selectStyle(id) {
    if (!findById(availableStyles(), id)) return;
    const changed = state.styleId !== id;
    if (changed) {
      Object.assign(state, { styleId: id, characterId: null, backgroundId: null });
      renderCharacterOptions();
      elements.backgroundOptions.replaceChildren();
    }
    finishSelection(changed ? "已選擇風格，請從 " + availableCharacters().length + " 個角色中選擇一個。" : "保留原本的畫風與後續選擇。", changed);
  }

  function selectCharacter(id) {
    const character = findById(characters, id);
    if (!character || character.typeId !== state.typeId || character.styleId !== state.styleId) return;
    const changed = state.characterId !== id;
    if (changed) {
      state.characterId = id;
      state.backgroundId = null;
      renderBackgroundOptions();
    }
    finishSelection(changed ? "已選擇角色，請繼續選擇場景線索。" : "保留原本的角色與場景。", changed);
  }

  function selectBackground(id) {
    if (!findById(availableBackgrounds(), id)) return;
    const changed = state.backgroundId !== id;
    state.backgroundId = id;
    finishSelection("配方完成！先想像畫面，再揭曉冒險。", changed);
  }

  function playLoadedReveal() {
    if (!revealed || !revealSoundPending || !elements.backgroundImage.complete || !elements.backgroundImage.naturalWidth) return;
    if (!elements.characterImage.hidden && (!elements.characterImage.complete || !elements.characterImage.naturalWidth)) return;
    revealSoundPending = false;
    window.ADVENTURE_AUDIO?.reveal({ roleId: selectedCharacter()?.roleId, backgroundId: state.backgroundId });
  }

  function revealResult() {
    const character = selectedCharacter();
    const background = selectedBackground();
    if (!character || !background || !findById(availableBackgrounds(character), background.id)) return;
    const completeScene = character.scenes?.[background.id];
    if (completeScene?.available === false) {
      hideResult();
      return;
    }
    revealSoundPending = true;
    elements.scene.classList.toggle("is-complete-scene", Boolean(completeScene));
    elements.characterImage.hidden = Boolean(completeScene);
    elements.backgroundImage.src = completeScene ? completeScene.image : background.image;
    elements.backgroundImage.alt = completeScene
      ? `${character.roleName}在${background.name}${completeScene.action}，${findById(styles, character.styleId).name}`
      : background.name;
    if (completeScene) {
      elements.characterImage.removeAttribute("src");
      elements.characterImage.alt = "";
    } else {
      elements.characterImage.src = character.image;
      elements.characterImage.alt = character.name;
      elements.characterImage.style.setProperty("--character-width", character.width);
    }
    elements.resultCharacter.textContent = character.roleName;
    elements.resultBackground.textContent = background.name;
    elements.resultStyle.textContent = findById(styles, character.styleId).name;
    elements.resultSummary.hidden = false;
    elements.status.textContent = `已揭曉：${character.roleName}，${background.name}。`;
    revealed = true;
    expandedStep = 4;
    updateChoiceSections();
    elements.workspace.classList.add("has-result");
    elements.recipePanel.hidden = true;
    elements.scene.hidden = false;
    elements.resultActions.hidden = false;
    elements.revealButton.hidden = true;
    elements.resultHeading.textContent = "你的冒險，揭曉了！";
    elements.scene.classList.add("is-revealed");
    updateStepIndicators();
    elements.scene.scrollIntoView({ behavior: "auto", block: "nearest" });
    elements.scene.focus({ preventScroll: true });
    playLoadedReveal();
  }

  function changeScene() {
    if (!selectedCharacter()) return;
    state.backgroundId = null;
    expandedStep = 3;
    hideResult("保留角色與畫風，選一張新的場景線索卡。再想像、再揭曉！");
    updateProgress();
    elements.backgroundSection.scrollIntoView({ behavior: "auto", block: "start" });
    elements.backgroundOptions.querySelector("button")?.focus({ preventScroll: true });
  }

  function initializeMotionPreference() {
    try { elements.reduceMotion.checked = window.localStorage.getItem("adventure-reduce-motion") === "true"; }
    catch { elements.reduceMotion.checked = false; }
    const apply = () => document.body.classList.toggle("reduce-motion", elements.reduceMotion.checked);
    apply();
    elements.reduceMotion.addEventListener("change", () => {
      apply();
      try { window.localStorage.setItem("adventure-reduce-motion", String(elements.reduceMotion.checked)); }
      catch { /* The control also works when storage is unavailable for local files. */ }
    });
  }

  function showExperience() {
    elements.homeScreen.hidden = true;
    elements.experienceHeader.hidden = false;
    elements.workspace.hidden = false;
    window.scrollTo({ top: 0, behavior: "instant" });
    elements.typeOptions.querySelector("button")?.focus({ preventScroll: true });
  }

  function returnHome() {
    window.ADVENTURE_AUDIO?.stopExperience?.();
    resetExperience();
    elements.experienceHeader.hidden = true;
    elements.workspace.hidden = true;
    elements.homeScreen.hidden = false;
    document.querySelector(".audio-settings").open = false;
    window.scrollTo({ top: 0, behavior: "instant" });
    elements.startButton.focus({ preventScroll: true });
  }

  function resetExperience() {
    expandedStep = 0;
    elements.promptCard.open = false;
    Object.assign(state, { typeId: null, styleId: null, characterId: null, backgroundId: null });
    elements.characterOptions.replaceChildren();
    elements.styleOptions.replaceChildren();
    elements.backgroundOptions.replaceChildren();
    updateProgress();
    hideResult("");
    elements.typeOptions.querySelector("button")?.focus();
  }

  function reportImageError(event) {
    if (!event.currentTarget.getAttribute("src") || !elements.scene.classList.contains("is-revealed")) return;
    const label = elements.scene.classList.contains("is-complete-scene") ? "完整場景" : event.currentTarget === elements.characterImage ? "角色" : "背景";
    const returnFocus = document.activeElement === elements.scene;
    hideResult(`${label}圖片無法載入，請確認完整資料夾是否一起複製，再按「揭曉我的冒險」重試。`);
    if (returnFocus) elements.revealButton.focus({ preventScroll: true });
  }

  function registerWebMcpTool() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    try {
      void Promise.resolve(context.registerTool({
        name: "show_prompt_combination",
        title: "顯示提示詞組合",
        description: "依角色類型、風格、角色與相容場景，顯示對應的離線預製圖片。每個角色可選擇四個相容場景。",
        inputSchema: {
          type: "object",
          properties: {
            typeId: { type: "string", enum: types.map((item) => item.id) },
            styleId: { type: "string", enum: styles.map((item) => item.id) },
            characterId: { type: "string", enum: characters.map((item) => item.id) },
            backgroundId: { type: "string", enum: backgrounds.map((item) => item.id) },
          },
          required: ["typeId", "styleId", "characterId", "backgroundId"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          const character = findById(characters, input.characterId);
          const background = findById(backgrounds, input.backgroundId);
          if (!character || !background || character.typeId !== input.typeId || character.styleId !== input.styleId || !findById(availableBackgrounds(character), background.id)) {
            throw new Error("角色類型、風格、角色或背景代碼不相符");
          }
          hideResult();
          Object.assign(state, {
            typeId: input.typeId,
            styleId: input.styleId,
            characterId: input.characterId,
            backgroundId: input.backgroundId,
          });
          expandedStep = 4;
          showExperience();
          renderStyleOptions();
          renderCharacterOptions();
          renderBackgroundOptions();
          updateProgress();
          revealResult();
          return { combinationId: `${character.id}-${background.id}`, prompt: promptText(character, background), imageAvailable: !pendingScene() };
        },
      })).catch(() => {});
    } catch {
      // 不支援 WebMCP 的瀏覽器仍可正常操作網站。
    }
  }

  renderFixedOptions();
  updateProgress();
  elements.revealButton.addEventListener("click", revealResult);
  elements.resetButton.addEventListener("click", resetExperience);
  elements.startButton.addEventListener("click", () => {
    showExperience();
    window.ADVENTURE_AUDIO?.startExperience?.();
  });
  elements.homeButton.addEventListener("click", returnHome);
  elements.changeSceneButton.addEventListener("click", changeScene);
  elements.backgroundImage.addEventListener("error", reportImageError);
  elements.characterImage.addEventListener("error", reportImageError);
  elements.backgroundImage.addEventListener("load", playLoadedReveal);
  elements.characterImage.addEventListener("load", playLoadedReveal);
  choiceSections.forEach((item, index) => item.edit.addEventListener("click", () => editChoice(index)));
  initializeMotionPreference();
  registerWebMcpTool();
})();
