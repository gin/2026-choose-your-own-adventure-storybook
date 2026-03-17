import { generateIllustration } from '../../tools/generate_illustration';
import { extractTaggedBlocks } from './tag-parser';
import { StoryTurnState } from './story-turn-state';

type WsClient = {
  send: (data: string) => void;
};

type IllustrationResult = {
  success?: boolean;
  url?: string;
  error?: string;
};

export class IllustrationManager {
  constructor(
    private readonly wsClient: WsClient,
    private readonly state: StoryTurnState,
  ) {}

  buildScenePrompt(sceneText: string) {
    const trimmed = sceneText.replace(/\s+/g, ' ').trim().slice(0, 800);
    return `Create a warm, colorful storybook illustration of this scene. Keep it child-friendly and focus on the main action. Scene: ${trimmed}`;
  }

  buildChoiceScenePrompt(choiceText: string, sceneText: string) {
    const trimmedChoice = choiceText.replace(/\s+/g, ' ').trim().slice(0, 240);
    const trimmedScene = sceneText.replace(/\s+/g, ' ').trim().slice(0, 700);
    return `Create a warm, colorful storybook illustration for the next page. The child chose: ${trimmedChoice}. Show the resulting scene from the story, keep it child-friendly, and clearly feature the child from the reference photo as the hero. Scene: ${trimmedScene}`;
  }

  triggerStoryStartImage(promptOverride?: string, referenceImageUrl?: string) {
    if (this.state.storyImageGenerated) return;
    if (!this.state.canGenerateMoreImages()) {
      console.warn('>>> BUDGET EXCEEDED: Skipping story start image');
      return;
    }

    this.state.markStoryStartImageTriggered();
    const prompt =
      (promptOverride || '').trim() ||
      'Opening scene of a warm, magical storybook for a 3-year-old. Soft, colorful, child-friendly illustration based on the child in the reference photo.';

    console.log(`>>> STORY START IMAGE: ${prompt}`);
    this.generateAndSend(prompt, referenceImageUrl, true);
  }

  processImageTags(bufferName: 'modelTextBuffer' | 'transcriptionBuffer') {
    // Disabled as per cost-saving plan: Only generate images on user choice.
    return;
  }

  maybeGenerateChoiceImage() {
    const completedTurnText = this.state.getCompletedTurnText();
    if (!this.state.shouldGenerateChoiceImage() || !completedTurnText) return;

    if (!this.state.canGenerateMoreImages()) {
      console.warn('>>> BUDGET EXCEEDED: Skipping choice image');
      return;
    }

    const userChoiceText = this.state.getUserChoiceText();
    const prompt = userChoiceText
      ? this.buildChoiceScenePrompt(userChoiceText, completedTurnText)
      : this.buildScenePrompt(completedTurnText);
    console.log(`>>> CHOICE IMAGE: ${prompt.substring(0, 120)}...`);
    this.state.noteChoiceImageGenerated();
    this.generateAndSend(prompt, this.state.heroImageUrl, true);
  }

  private generateAndSend(prompt: string, referenceImageUrl?: string, notifyOnError?: boolean) {
    generateIllustration({ prompt, referenceImageUrl })
      .then((result: IllustrationResult) => {
        if (result.success && result.url) {
          this.state.markImageDelivered();
          console.log(`>>> IMAGE READY: ${result.url.substring(0, 50)}...`);
          this.wsClient.send(
            JSON.stringify({
              type: 'illustration',
              data: { url: result.url },
            }),
          );
        } else {
          console.error('>>> IMAGE GENERATION FAILED:', result.error);
          if (notifyOnError) {
            try {
              this.wsClient.send(
                JSON.stringify({
                  type: 'illustration_error',
                  data: { error: result.error || 'Image generation failed' },
                }),
              );
            } catch {}
          }
        }
      })
      .catch((err) => console.error('>>> TRIGGER ERROR:', err));
  }
}
