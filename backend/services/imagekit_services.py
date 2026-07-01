from imagekitio import ImageKit
from config import IMAGEKIT_PRIVATE_KEY

imagekit = ImageKit(
    private_key=IMAGEKIT_PRIVATE_KEY,
)

def upload_file(file_bytes: bytes, file_name: str, folder: str = "user_uploads"):
    try:
        res = imagekit.files.upload(
            file=file_bytes,
            file_name=file_name,
            folder=folder,
            is_private_file=False,
            use_unique_file_name=True
        )
        # #region agent log
        import json as _json, time as _time, os as _os
        _log_path = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "..", "..", "debug-f99e6c.log"))
        with open(_log_path, "a") as _f:
            _f.write(_json.dumps({"sessionId":"f99e6c","hypothesisId":"A","location":"imagekit_services.py:upload_file","message":"imagekit upload success","data":{"url":res.url,"folder":folder},"timestamp":int(_time.time()*1000)})+"\n")
        # #endregion
        return res.url
    except Exception as e:
        # #region agent log
        import json as _json, time as _time, os as _os
        _log_path = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), "..", "..", "debug-f99e6c.log"))
        with open(_log_path, "a") as _f:
            _f.write(_json.dumps({"sessionId":"f99e6c","hypothesisId":"A","location":"imagekit_services.py:upload_file","message":"imagekit upload failed","data":{"error":str(e)[:300]},"timestamp":int(_time.time()*1000)})+"\n")
        # #endregion
        raise Exception(f"Failed to upload file: {str(e)}")

def get_variants(base_url: str) -> dict:
    return {
        "youtube": f"{base_url}?tr=w-1280,h-720,c_maintain_ratio,fo-auto",
        "short": f"{base_url}?tr=w-1080,h-1920,c_maintain_ratio,fo-auto",
        "square": f"{base_url}?tr=w-1080,h-1080,c_maintain_ratio,fo-auto"
    }