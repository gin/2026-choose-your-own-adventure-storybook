export class StoryTurnState {
  modelTextBuffer = '';
  transcriptionBuffer = '';
  userInputBuffer = '';
  storyImageGenerated = false;
  pendingChoiceImage = false;
  hasCompletedFirstNarration = false;
  heroImageUrl: string | undefined;
  imageTagsSeenThisTurn = new Set<string>();
  imageDeliveredThisTurn = false;
  choiceTurnCount = 0;

  appendModelText(text: string) {
    this.modelTextBuffer += text;
  }

  appendTranscription(text: string) {
    this.transcriptionBuffer += text;
  }

  appendUserInput(text: string) {
    this.userInputBuffer += text;
  }

  setModelTextBuffer(buffer: string) {
    this.modelTextBuffer = buffer;
  }

  setTranscriptionBuffer(buffer: string) {
    this.transcriptionBuffer = buffer;
  }

  getUserChoiceText() {
    return this.userInputBuffer.trim();
  }

  setHeroImageUrl(url?: string) {
    this.heroImageUrl = url;
  }

  noteUserTurnEnded() {
    if (this.hasCompletedFirstNarration) {
      this.pendingChoiceImage = true;
    }
  }

  markStoryStartImageTriggered() {
    this.storyImageGenerated = true;
  }

  noteImagePrompt(prompt: string) {
    this.imageTagsSeenThisTurn.add(prompt);
  }

  hasSeenImagePrompt(prompt: string) {
    return this.imageTagsSeenThisTurn.has(prompt);
  }

  getCompletedTurnText() {
    return this.transcriptionBuffer.trim() || this.modelTextBuffer.trim();
  }

  shouldGenerateChoiceImage() {
    return this.pendingChoiceImage && !!this.getCompletedTurnText() && !this.imageDeliveredThisTurn;
  }

  noteChoiceImageGenerated() {
    this.choiceTurnCount += 1;
  }

  markImageDelivered() {
    this.imageDeliveredThisTurn = true;
  }

  finalizeCompletedNarration() {
    if (this.getCompletedTurnText()) {
      this.hasCompletedFirstNarration = true;
    }
  }

  resetTurn() {
    this.pendingChoiceImage = false;
    this.modelTextBuffer = '';
    this.transcriptionBuffer = '';
    this.userInputBuffer = '';
    this.imageTagsSeenThisTurn = new Set<string>();
    this.imageDeliveredThisTurn = false;
  }
}
