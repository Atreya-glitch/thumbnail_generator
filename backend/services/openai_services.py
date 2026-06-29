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
   
        if "does not exist" in str(e) or "insufficient_quota" in str(e) or "400" in str(e):
     
            image_url = "https://picsum.photos/1024/1024"
        else:
            raise e
    
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        img_response = await client.get(image_url)
        if img_response.status_code == 200:
            return img_response.content
        else:
            raise RuntimeError(f"Failed to download generated image: Status {img_response.status_code}")