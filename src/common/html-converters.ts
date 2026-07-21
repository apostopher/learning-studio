import mammoth from 'mammoth';
import { generateText } from 'ai';

/** Convert a .docx buffer to HTML. Fails soft to ''. */
export async function convertWordToHtml(buffer: Buffer): Promise<string> {
  try {
    const { value } = await mammoth.convertToHtml({ buffer });
    return value;
  } catch (error) {
    console.error('Error converting Word to HTML:', error);
    return '';
  }
}

/**
 * Convert a PDF (as ArrayBuffer) to semantic HTML using the gateway LLM.
 * Model string form routes through the Vercel AI Gateway (same as the rest of
 * this repo's AI calls). Fails soft to ''.
 */
export async function convertPdfToHtml(
  fileName: string,
  arrayBuffer: ArrayBuffer,
): Promise<string> {
  try {
    const { text = '' } = await generateText({
      model: 'google/gemini-2.5-flash',
      system: `You are a helpful assistant that converts PDF to HTML.
Ignore all images and color/style formatting. Keep semantic formatting.
Headings as <h1>..<h6>, paragraphs as <p>, lists as <ul>/<li>, code as <code>,
blockquotes as <blockquote>, links as <a>, tables as <table>/<tr>/<td>/<th>.
Omit images. Include all text. Remove extra spaces and new lines.
Use '${fileName}' as the title of the html.`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'file', data: arrayBuffer, mediaType: 'application/pdf' },
          ],
        },
      ],
    });
    return text.trim();
  } catch (error) {
    console.error('Error converting PDF to HTML:', error);
    return '';
  }
}
