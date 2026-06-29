import asyncio
import httpx
from openai import AsyncOpenAI
from config import OPENAI_API_KEY

async_openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

async def generate_thumbnail(prompt: str, style_prompt: str, headshot_url: str) -> bytes:
    full_prompt = (
        f"{style_prompt}\n\n"
        f"User prompt: {prompt}\n\n"
        f"Reference headshot image URL: {headshot_url}\n\n"
        f"Generate a professional, high-quality YouTube thumbnail containing a character matching this style and the headshot."
    )

    try:
        response = await async_openai_client.images.generate(
            model="gpt-image-2",
            prompt=full_prompt,
            n=1,
            size="1024x1024",
        )
        image_url = response.data[0].url
    except Exception as e:
        # If OpenAI key has no credits/access, fallback to a free AI image generator (pollinations.ai)
        if "does not exist" in str(e) or "insufficient_quota" in str(e) or "billing" in str(e) or "400" in str(e):
            import urllib.parse
            import random
            # Stagger initial requests to avoid concurrent rate limits
            await asyncio.sleep(random.uniform(0.2, 3.0))
            # Combine prompt and style for the generator
            combined_prompt = f"{style_prompt}. {prompt}"
            encoded_prompt = urllib.parse.quote(combined_prompt)
            image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true"
        else:
            raise e
    
    max_retries = 5
    delay = 2.0
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                img_response = await client.get(image_url)
                if img_response.status_code == 200:
                    return img_response.content
                elif img_response.status_code == 429 and attempt < max_retries - 1:
                    import random
                    # Add random jitter to retry delays to avoid collisions
                    await asyncio.sleep(delay + random.uniform(0.5, 2.5))
                    delay *= 2
                    continue
                else:
                    raise RuntimeError(f"Failed to download generated image: Status {img_response.status_code}")
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            import random
            await asyncio.sleep(delay + random.uniform(0.5, 2.5))
            delay *= 2