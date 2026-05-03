INSERT INTO teams (short_name, full_name) VALUES
('LG', 'LG 트윈스'),
('KT', 'KT 위즈'),
('SSG', 'SSG 랜더스'),
('KIA', 'KIA 타이거즈'),
('NC', 'NC 다이노스'),
('두산', '두산 베어스'),
('롯데', '롯데 자이언츠'),
('삼성', '삼성 라이온즈'),
('키움', '키움 히어로즈'),
('한화', '한화 이글스')
ON CONFLICT (short_name) DO NOTHING;