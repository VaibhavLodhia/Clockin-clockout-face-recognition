# Migration: Face Embeddings to JSONB

> **⚠️ IMPORTANT:** This migration is **ONLY needed** if you have an **existing database** with the old `FLOAT[]` format.  
> If you're setting up a **new database**, `SETUP_DATABASE.sql` already creates the table with JSONB format - **skip this file**.

## Overview
Changed `face_embeddings.embedding` from `FLOAT[]` to `JSONB` to store array of arrays (4 embeddings per user).

## Database Migration

Run this SQL in Supabase SQL Editor:

```sql
-- Step 1: Add new column
ALTER TABLE public.face_embeddings 
ADD COLUMN embedding_new JSONB;

-- Step 2: Migrate existing data (if any)
-- Convert single FLOAT[] to array of arrays format
-- Note: If you have existing data, wrap the single array in another array
UPDATE public.face_embeddings
SET embedding_new = jsonb_build_array(to_jsonb(embedding))
WHERE embedding IS NOT NULL;

-- Step 3: Drop old column
ALTER TABLE public.face_embeddings 
DROP COLUMN embedding;

-- Step 4: Rename new column
ALTER TABLE public.face_embeddings 
RENAME COLUMN embedding_new TO embedding;

-- Step 5: Add NOT NULL constraint
ALTER TABLE public.face_embeddings 
ALTER COLUMN embedding SET NOT NULL;
```

## New Format

**Before (FLOAT[]):**
```json
[0.123, 0.456, ...] // Single 128-dimensional array
```

**After (JSONB):**
```json
[
  [0.123, 0.456, ...], // Embedding 1 (128 dimensions)
  [0.789, 0.012, ...], // Embedding 2 (128 dimensions)
  [0.345, 0.678, ...], // Embedding 3 (128 dimensions)
  [0.901, 0.234, ...] // Embedding 4 (128 dimensions)
]
```

## Model Version
Updated `model_version` default from `'mediapipe_v1'` to `'face_recognition_v1'`.

## Notes
- Each user now stores 4 embeddings (captured from different angles during signup)
- During clock in/out, new embedding is compared against all 4 stored embeddings
- Best match (highest similarity) is used for verification
- Embeddings are 128-dimensional vectors from `face_recognition` library (face landmarks)

