from PIL import Image, ImageDraw

def create_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Outer rounded rect background
    bg_color = (255, 110, 64) # vibrant coral/orange
    draw.rounded_rectangle([0, 0, size, size], radius=int(size * 0.22), fill=(30, 41, 59))
    
    # Inner circular badge with gradient-like concentric circles
    cx, cy = size / 2, size / 2 + size * 0.05
    r = size * 0.38
    
    # Base circle (green watermelon rind)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(34, 197, 94))
    
    # Dark green stripes
    stripe_w = int(r * 0.15)
    draw.line([cx - r * 0.6, cy - r * 0.7, cx - r * 0.4, cy + r * 0.7], fill=(21, 128, 61), width=stripe_w)
    draw.line([cx, cy - r * 0.9, cx, cy + r * 0.9], fill=(21, 128, 61), width=stripe_w)
    draw.line([cx + r * 0.6, cy - r * 0.7, cx + r * 0.4, cy + r * 0.7], fill=(21, 128, 61), width=stripe_w)
    
    # Red inner core
    r_core = r * 0.75
    draw.ellipse([cx - r_core, cy - r_core * 0.8, cx + r_core, cy + r_core * 1.1], fill=(244, 63, 94))
    
    # Little witch hat on top
    hat_w = r * 1.2
    hat_y = cy - r * 0.7
    # Hat brim
    draw.ellipse([cx - hat_w * 0.5, hat_y - r * 0.1, cx + hat_w * 0.5, hat_y + r * 0.1], fill=(88, 28, 135))
    # Hat cone
    draw.polygon([
        (cx - hat_w * 0.3, hat_y),
        (cx + hat_w * 0.3, hat_y),
        (cx + hat_w * 0.05, hat_y - r * 0.7)
    ], fill=(107, 33, 168))
    # Hat gold buckle
    draw.rectangle([cx - hat_w * 0.1, hat_y - r * 0.12, cx + hat_w * 0.1, hat_y - r * 0.02], fill=(234, 179, 8))
    
    # Eyes
    eye_r = r * 0.12
    draw.ellipse([cx - r * 0.3 - eye_r, cy - eye_r, cx - r * 0.3 + eye_r, cy + eye_r], fill=(30, 20, 20))
    draw.ellipse([cx + r * 0.3 - eye_r, cy - eye_r, cx + r * 0.3 + eye_r, cy + eye_r], fill=(30, 20, 20))
    # Eye sparkles
    sp_r = eye_r * 0.4
    draw.ellipse([cx - r * 0.3 - sp_r, cy - sp_r - eye_r * 0.3, cx - r * 0.3 + sp_r, cy + sp_r - eye_r * 0.3], fill=(255, 255, 255))
    draw.ellipse([cx + r * 0.3 - sp_r, cy - sp_r - eye_r * 0.3, cx + r * 0.3 + sp_r, cy + sp_r - eye_r * 0.3], fill=(255, 255, 255))
    
    # Pink cheeks
    blush_r = r * 0.14
    draw.ellipse([cx - r * 0.45 - blush_r, cy + r * 0.18 - blush_r * 0.6, cx - r * 0.45 + blush_r, cy + r * 0.18 + blush_r * 0.6], fill=(251, 113, 133))
    draw.ellipse([cx + r * 0.45 - blush_r, cy + r * 0.18 - blush_r * 0.6, cx + r * 0.45 + blush_r, cy + r * 0.18 + blush_r * 0.6], fill=(251, 113, 133))
    
    # Cute smile
    draw.arc([cx - r * 0.18, cy + r * 0.05, cx + r * 0.18, cy + r * 0.32], start=10, end=170, fill=(30, 20, 20), width=int(r * 0.07))
    
    # Top-left specular highlight
    draw.arc([cx - r * 0.85, cy - r * 0.85, cx + r * 0.85, cy + r * 0.85], start=200, end=250, fill=(255, 255, 255, 180), width=int(r * 0.1))
    
    return img

if __name__ == '__main__':
    icon192 = create_icon(192)
    icon192.save('c:/Scripts/Suika/public/icon-192.png', 'PNG')
    icon512 = create_icon(512)
    icon512.save('c:/Scripts/Suika/public/icon-512.png', 'PNG')
    print("Icons generated successfully!")
