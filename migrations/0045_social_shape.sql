-- Instagram photo shape per post: '4:5' (default), '1:1' or 'original' (src/studio/social.ts).
ALTER TABLE social_posts ADD COLUMN shape TEXT;
