import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { fal } from "@fal-ai/client";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

fal.config({
  credentials: process.env.FAL_KEY,
});

const dailyUsageMap = new Map();
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT_SECONDS || 90);

function getTodayKey(userId) {
  const today = new Date().toISOString().split("T")[0];
  return `${userId}_${today}`;
}

app.post("/api/v1/videos/generate", upload.single("media"), async (req, res) => {
  try {
    const {
      userId = "guest",
      mode = "text-to-video",
      prompt,
      style = "cinematic",
      duration = 5,
      aspectRatio = "16:9"
    } = req.body;

    const reqDuration = Number(duration);
    const usedToday = dailyUsageMap.get(getTodayKey(userId)) || 0;

    if (usedToday + reqDuration > DAILY_LIMIT) {
      return res.status(429).json({
        error: `Daily limit reached. Remaining: ${DAILY_LIMIT - usedToday}s`
      });
    }

    const styledPrompt = `${prompt}, ${style} style`;
    let modelEndpoint = "fal-ai/kling-video/v3/standard/text-to-video";
    let inputPayload = {
      prompt: styledPrompt,
      duration: String(reqDuration),
      aspect_ratio: aspectRatio
    };

    if (mode === "image-to-video" && req.file) {
      const imageUrl = await fal.storage.upload(
        new Blob([req.file.buffer], { type: req.file.mimetype })
      );
      modelEndpoint = "fal-ai/kling-video/v3/standard/image-to-video";
      inputPayload.start_image_url = imageUrl;
    }

    const result = await fal.subscribe(modelEndpoint, {
      input: inputPayload,
      logs: true
    });

    if (result?.data?.video?.url) {
      dailyUsageMap.set(getTodayKey(userId), usedToday + reqDuration);
      return res.json({
        success: true,
        videoUrl: result.data.video.url
      });
    }
    throw new Error("No video URL returned.");
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
