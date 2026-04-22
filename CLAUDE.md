You are an expert full-stack developer and UI/UX designer specializing in premium 2026 e-commerce experiences. I want you to build a complete, production-ready luxury skincare webshop that looks and feels like the absolute best version of https://peonybeauty.nl/ — but elevated to 2026 standards.

Key design references (emulate and improve):
- Luxurious, minimalist, high-end aesthetic with premium product photography
- Clean navigation, elegant typography, soft color palette (peony pinks, warm neutrals, golds, sage greens, deep creams)
- Smooth scrolling, generous whitespace, focus on sensory beauty rituals
- Make it even more immersive: subtle nature-inspired micro-animations (floating petals, soft glows, gentle leaf movements), glassmorphism accents, dark/light mode toggle with automatic preference, parallax hero, 3D product hover effects (tilt + shine), cinematic transitions.

Core requirements:
1. **Frontend (public user experience)** – The most beautiful skincare shop in 2026
   - Homepage: cinematic hero with video/background + AI assistant teaser, bestsellers carousel, category showcase, “Your Ritual” personalized section, testimonials, journal teaser, newsletter.
   - Shop page with advanced filters (skin type, concern, price, brand, ingredients), infinite scroll, quick view modal.
   - Product detail pages with rich text, ingredient breakdown, “how to use” ritual steps, reviews, related products, “add to ritual” bundle suggestions.
   - Cart drawer with beautiful animations, wishlist, mini-cart.
   - AI Skin Assistant (floating orb/chat bubble that feels futuristic and premium).

2. **AI Assistant (the star feature – make it better than anything on peonybeauty.nl)**
   - Beautiful floating chatbot with 2026 UI (glass orb, typing animation, voice input optional).
   - Powered by Anthropic Claude (or Grok/OpenAI via Vercel AI SDK).
   - Capabilities:
     • Real-time product recommendation using database queries (via tool/function calling)
     • Skin quiz (step-by-step, then suggests full routine)
     • Answers any skincare question with brand/product knowledge
     • “Build my ritual” feature
     • Remembers conversation context per user session
   - Use Vercel AI SDK + streaming + tool calling to query the product database securely.

3. **Backend + Admin Panel (no coding required for owner)**
   - Protected /admin dashboard with modern, beautiful UI (same design system as frontend).
   - Admin can:
     • CRUD products (name, description with rich text editor, price, sale price, images upload with drag-drop + multiple, variants, stock, categories, tags, ingredients list, benefits, SEO fields)
     • Manage categories, brands, homepage banners/carousels
     • View & manage orders, customers, coupons
     • Basic analytics dashboard
     • Settings (shipping, taxes, SEO, AI assistant prompt tuning)
   - Use rich text editor (Tiptap), image upload with preview, status toggles, bulk actions.

Tech stack (2026 best-in-class, easy to maintain & deploy on Vercel):
- Next.js 15 (App Router, React Server Components, Server Actions)
- TypeScript
- Tailwind CSS + shadcn/ui + Aceternity UI / Magic UI components
- Framer Motion + GSAP for premium animations
- Prisma + PostgreSQL (or Supabase if you prefer)
- Clerk or Supabase Auth (role-based: customer + admin)
- Stripe for checkout
- UploadThing or Supabase Storage for images
- Vercel AI SDK + Anthropic for the AI assistant
- Zod + React Hook Form
- Deploy-ready on Vercel

Project structure:
- Use route groups: (public), (admin), (api)
- Clear folder organization (components, lib, app, types, etc.)
- Full TypeScript, proper error handling, loading states, SEO (Next.js metadata + schema.org)

Your response workflow:
1. First, confirm understanding and give me the complete project architecture + database schema (Prisma schema).
2. Then generate the full setup instructions (create-next-app command, env variables, packages to install).
3. After I say “continue”, start generating the code folder-by-folder and file-by-file (start with layout, theme, navigation, then homepage, then AI assistant, then admin panel).
4. Make every component beautiful, accessible, mobile-first, and ultra-premium.
5. Include comments and explanations so I can maintain it easily.

This must feel like the most luxurious skincare experience on the internet in 2026 while being dead-simple for the owner to manage products and content.

Ready when you are — start with step 1 (architecture + Prisma schema).