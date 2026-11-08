# Gift Planner

A whimsical, multi-user gift planning app built with React, Vite, and Supabase.

## Features

- Account sign up, sign in, and password reset email flow
- Person folders for organizing gift ideas
- Gift capture from text notes, links, and uploaded photos/screenshots
- Gift planning by event (one event per gift)
- Gift status tracking (`idea` or `gifted`)
- Optional gift price field
- Delete gifts you no longer want to keep
- Private per-user data with Supabase Row Level Security

## Supabase setup

1. Create a Supabase project.
2. In Supabase SQL editor, run `supabase/schema.sql`.
3. In Supabase Storage, create a private bucket named `gifts-media`.
4. Copy `.env.example` to `.env`.
5. Fill in:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY`

## Local development

1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`

## Production build

Run `npm run build` to generate the static site in `dist/`.

## GitHub Pages deploy

This repository includes a GitHub Actions workflow at `.github/workflows/deploy.yml`.

For the deployed app to connect to Supabase, set these in GitHub repository settings:

- Variable: `VITE_SUPABASE_URL`
- Secret: `VITE_SUPABASE_ANON_KEY`

After pushing to `main`, the workflow builds the app and deploys to GitHub Pages.
