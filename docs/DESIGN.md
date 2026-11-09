# CRENORD design system
 
## Brand and feel
CRENORD is calm, professional, dark and cinematic. The user's content is the hero and the interface recedes. Reference: the dark studio look of Higgsfield and Runway: near-black canvas, ONE accent colour, large confident type, generous spacing, thin 1px borders, almost no decoration.
Wordmark: CRENORD in uppercase, weight 600, letter-spacing 0.14em, 16px in the sidebar.
Never use: a light theme, gradients on UI chrome (buttons, sidebar, cards), glassmorphism or blur panels, neon glows, emoji, coloured section backgrounds, extra shadows, or a second accent colour.
 
## Colour tokens (dark only)
Implement as CSS variables in src/client/styles/tokens.css and use only these variables.
- bg-0 #050608 page canvas; bg-1 #0A0B0F sidebar and drawers; bg-2 #101217 cards, prompt bar, popovers; bg-3 #161920 hover, chips, inputs; bg-4 #1C202A pressed or selected
- border-subtle #1C1F27; border-strong #2A2E39
- text-primary #F4F5F7; text-secondary #9AA0AE; text-tertiary #5F6575; text-disabled #3E4350
- accent #3D6BFF; accent-hover #5A82FF; accent-pressed #2F58E0; accent-soft rgba(61,107,255,0.14); on-accent #FFFFFF
- success #2FBF71; warning #F5A524; danger #F0506E (each with a 14% tinted background for badges)
- Accent is used only for primary buttons, the active nav ring, focus rings, selected states, progress bars and links.
 
## Typography
Inter (fallback system-ui, -apple-system, Segoe UI, sans-serif). Tabular figures for numbers.
- Display 56/60, 700, -0.025em (Home hero only)
- H1 28/34, 600, -0.015em; H2 18/24, 600; H3 15/20, 600
- Body 14/22; Small 13/18; Caption 12/16 in text-secondary; Button 14/20, 500
 
## Shape, spacing, elevation, icons, motion
- Radius: prompt bar 28; cards and tiles 16; modals and drawers 20; buttons and inputs 12; chips, badges and avatars fully round.
- 1px solid border-subtle on every card, input, chip and divider; hover raises the border to border-strong.
- 4px grid (4, 8, 12, 16, 24, 32, 48, 64). Page padding 32 desktop and 16 mobile; card gap 16; section gap 48.
- Only two shadows: prompt bar 0 24px 60px rgba(0,0,0,0.55); popovers and modals 0 16px 48px rgba(0,0,0,0.6) plus 1px border-strong. Modal backdrop rgba(0,0,0,0.6).
- Icons: lucide-react, 20px, stroke 1.75, text-secondary (text-primary when active).
- Motion: hover 150ms ease-out; popovers 180ms fade plus 4px rise; drawers and modals 240ms; skeleton shimmer 1.4s linear loop; honour prefers-reduced-motion.
- Step 1 only: placeholder media are dark two-tone gradient tiles at the right aspect ratio with a faint icon; video tiles have a 40px play circle and a duration badge. No photos and no external image URLs.
 
## App shell
Routes: /login (public), /, /image, /video, /edit, /clean, /assets, /projects, /projects/:id, /plans.
- Sidebar: 264px (collapses to a 72px rail), bg-1, right border. Header 64px: logo mark 28px plus the CRENORD wordmark; collapse button.
- 'New Generation' split button (height 44, bg-2, border, radius 12) with a menu: New image, New video, Edit a file, Clean a file.
- Nav (item height 40, radius 12, icon 20, 14/500): Home, Image, Video, Edit, Clean, then a divider with the caption LIBRARY (uppercase 11px, letter-spacing 0.08em, text-tertiary), then Assets, Projects. Active item: bg-4, 1px accent ring at 60% opacity, text-primary.
- Bottom: a Today card (bg-2, border, radius 16, padding 12) with 'Today' and spend such as '$0.42 / $3.00', a 4px progress bar (accent; warning above 80%; danger at 100%) and a link 'Usage' to /plans. Then the user row (avatar 32px, name, email caption) with a popover: Profile, Usage, Sign out.
- Main area: bg-0, scrolls independently, max width 1200 unless a page says otherwise.
- Floating cluster top right: a Jobs button (activity icon with a count badge) and a Help button, both 40px circles. The Jobs panel is a 360px popover with the last 5 jobs (thumbnail, tool, status chip Queued, Running with a thin bar, Done or Failed, and cost).
- Responsive: 1280px and wider full sidebar; 768 to 1279px rail; below 768px a bottom tab bar (Home, Image, Video, Edit, Clean, More). Drawers become full-screen sheets on mobile.
- Temporary design-review toggle: a pill at the bottom right with Filled | Empty | Loading | Error, visible only with ?review=1, marked data-design-review='true'.
 
## Shared components
- Button: primary, secondary, ghost, danger; heights 32, 40, 44; radius 12.
- Chip: height 32, bg-3, border, fully round, 13/500, optional icon and chevron; selected = accent-soft plus accent border.
- Segmented control: bg-3, radius 12, padding 4; options 32px high, radius 8; selected = bg-4.
- Badge: height 20, fully round, 12/500.
- PromptBar (the signature element): fixed at the bottom of the main area (centred in the page on Home). Width min(920px, 100% minus 64px), bg-2, border, radius 28, prompt-bar shadow, padding 16 20. Auto-growing textarea (1 to 8 lines, 16/24). Controls row 44px high: '+' attach, '@' mention an asset, divider, Model chip, Settings chip, page extras, spacer, Draft | Final segmented, enhance-prompt (sparkles) button, variants stepper (x1 to x4), cost label such as '≈ $0.04', and a 44px round send button (accent when ready; bg-4 when empty or when the cost guard blocks the job). Focus-within: border becomes accent at 50%.
- ModelPicker popover: 380px wide, search field, grouped rows (56px: 32px icon, name, caption, badges Fast, Best quality, Text in image, Editing, price label such as '$0.035 / image', check on the selected one). 'Auto' is first and means the cheapest draft model for the tool. Data comes from GET /api/models.
- SettingsPopover (340px): Format pills (Auto, 1:1, 4:5, 9:16, 16:9, 3:4), Resolution segmented, Quality segmented (image), Duration segmented (video), Audio switch (video), collapsible Advanced (Seed).
- ResultCard: tile at the true aspect ratio, radius 16. Hover: checkbox, favourite star, bottom action bar (Download, Edit, Animate or Extend, Clean, Add to project) and a more menu (Reuse prompt, Open details, Delete). States: running (shimmer plus progress ring with elapsed seconds), failed (danger tint plus Retry), done.
- DetailsDrawer: 440px, right side, slides in 240ms. Preview (image or video player), rows (Prompt with copy, Model, Format, Resolution, Created, Cost), buttons (Reuse settings, Edit, Animate or Extend, Clean, Download with format menu: png, jpg, webp or mp4, gif; Add to project; Delete).
- Dropzone (dashed 1.5px border-strong, radius 20, bg-2, 'Upload' plus 'Choose from Assets'), Before/After slider (draggable handle, pill labels), EmptyState, Skeleton, Toast (3 seconds), Modal (max 520), Tooltip, Table (row 56).
- CostBanner: danger-tinted inline banner above the PromptBar when the cost guard blocks a job, for example 'Daily limit reached ($3.00). Raise DAILY_CAP_USD in Secrets to continue.'
 
## Pages
**Login (/login):** centred card (400px, bg-2, radius 20, padding 32) with the wordmark, H1 'Sign in', a secondary button 'Continue with Google' and the caption 'Private studio'. Not-owner state: danger text 'This account is not allowed.'
 
**Home (/):** centred column 960px. Display heading 'What will you create today?'. PromptBar with an Image | Video switch. A Presets row of chips: Product on marble, Clean studio white, Lifestyle scene, Product in motion, Seasonal campaign, Flat lay. Five task cards (Create image, Create video, Edit, Clean, Assets). A Recent row of 8 tiles with a 'View all' link.
 
**Image (/image):** a scrolling feed above the fixed PromptBar, newest at the bottom. Sticky header: H1 'Image' and a segmented control 'Text to image' | 'Product scene'. Empty state: 'Write a prompt and hit generate to see your images appear here.' A generation group shows the prompt (2-line clamp), a caption (model, format, time), actions (Reuse prompt, Generate more, Delete) and a variants grid (1, 2 or 4). Product scene steps: 1 Add your product photo (dropzone strip 96px that becomes a 72px thumbnail), 2 Choose a scene (cards 120x140: Marble counter, Studio white, Wooden table, Outdoor garden, Kitchen morning, Bathroom shelf, Neon night, Seasonal), 3 Optional details in the prompt, 4 Generate, 5 Results with Edit, Animate and Clean.
 
**Video (/video):** same pattern as Image. Header segmented control 'Text to video' | 'Image to video' | 'Start & end frame'. Frame slots (72px) above the textarea inside the bar depending on the mode. Settings: Format, Resolution, Duration, Audio. The cost label updates live. Generation groups use video tiles (play overlay, duration badge) with actions Download, Extend, Upscale, Clean, Add to project. Running caption: 'Rendering... usually 1 to 3 minutes'. The drawer has a player with play, scrub, mute and fullscreen.
 
**Edit (/edit):** H1 'Edit' and a segmented control Image | Video. Empty: a Dropzone and six capability cards. Workspace: centre canvas with a checkerboard background and a toolbar pill (zoom out, zoom, zoom in, Fit, undo, redo, Compare); a right panel (360px) 'Tools' as an accordion; a bottom versions strip (96px). Image tools: AI edit (prompt plus quick ideas), Replace background (the 8 scene presets plus a prompt), Remove background, Upscale (2x | 4x), Resize for ads (checklist 9:16, 1:1, 4:5, 16:9 and a 'Create all sizes' button; no AI cost). Video tools: Upscale, Trim (range slider), Reformat (format checklist; no AI cost), Resize for ads. Every tool shows a description, its controls, a cost line and a primary Apply button. Footer: Save to Assets and Download.
 
**Clean (/clean):** H1 'Clean', caption 'Remove text, logos, watermarks and objects.', segmented Video | Image, and a step indicator (Upload, Choose what to remove, Review, Process, Download). Empty: a large Dropzone (800px wide) and three mini before/after cards (Text and subtitles, Logos and watermarks, Objects and people) plus a link 'Batch? Upload up to 30 files at once'. Workspace: a preview (video with a scrub bar that has markers where text is detected; image with dashed boxes) and a right panel (360px): Mode segmented 'Auto detect' | 'Manual brush'; 'What should we remove?' multi-select cards; in manual mode a brush toolbar (Brush, Eraser, size 4 to 120, Undo, Redo, Clear mask); a required checkbox 'I own this content or have permission to edit it.'; a primary 'Remove' button (disabled until ticked) with the cost. Processing: ring and Cancel. Done: Before/After, Download, Send to Edit, Save to Assets, Clean another file. Batch queue table (thumbnail, name, type, status chip, actions) with 'Add files', 'Clean all', 'Download all (.zip)'. Error banner with 'Try Manual brush' and 'Retry'.
 
**Assets (/assets):** H1 'Assets' with a count and an Upload button. Sticky toolbar: search, chips Type, Source (Generated, Uploaded, Edited, Cleaned), Date, Sort, a Favourites chip and a size control (S, M, L). Justified grid. Selection bar at the bottom (Download, Add to project, Export formats modal with 9:16, 1:1, 4:5, 16:9, Delete). Upload modal. Empty state with buttons Create image, Create video, Upload.
 
**Projects (/projects, /projects/:id):** header with search, sort and 'New project'. Card grid with a 2x2 collage cover, name, count and kebab menu. New project modal: name, description, cover colour swatches. Detail page: breadcrumb, editable title, 'Add assets', 'Export all', tabs Assets | Activity.
 
**Plans & usage (/plans):** H1 'Usage'. A Today card (spend against the cap), a daily totals bar chart made with simple CSS bars, and a usage table (Date, Tool, Model, Estimated cost, Status). Subscription plans are NOT built now.
 
## States and accessibility
Every page supports Filled, Empty, Loading (skeletons that match the layout) and Error (inline banner with Retry). Keyboard: everything reachable with Tab, visible focus ring (2px accent, 2px offset), Esc closes overlays, Enter sends the prompt and Shift+Enter adds a new line. Minimum hit target 40px. Text contrast at least 4.5:1. Icon-only buttons have aria-labels.
