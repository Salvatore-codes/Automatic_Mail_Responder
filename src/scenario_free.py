import re
from src.database import Catalog

def normalize_dimensions(text):
    """
    Normalizes special characters that appear in product specifications:
    - Inch symbols: 1" or 1’’ or 1in or 1inch → '1 inch'
    - Dimension separator: 12×24 or 12x24 → '12x24'
    - Float/decimal values: 1.5 mm, 0.5 inch stay as-is
    - Fraction dimensions: 1/2 inch, 3/4" → normalized
    Returns normalized text.
    """
    # Normalize fancy inch/quote symbols to standard double-quote
    text = re.sub(r'[\u2018\u2019\u201A\u201B]', "'", text)  # smart single quotes → '
    text = re.sub(r'[\u201C\u201D\u201E\u201F\u2033\u2036\u02BA]', '"', text)  # smart double/prime → "
    
    # Convert 1" / 1.5" / 1/2" → "1 inch" / "1.5 inch" / "1/2 inch"
    text = re.sub(r'(\d+(?:[./]\d+)?)\s*(?:"|\u2033|\u201D|in\b|inch\b)', r'\1 inch', text, flags=re.IGNORECASE)
    
    # Normalize × (multiplication sign) to x for dimensions
    text = re.sub(r'\s*[×\u00D7]\s*', 'x', text)
    
    # Normalize mm/cm/m spacing
    text = re.sub(r'(\d+(?:\.\d+)?)\s*(mm|cm|m|ft|inches?)\b', r'\1 \2', text, flags=re.IGNORECASE)
    
    # Normalize multiple spaces
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text


def parse_order_text_rules(text):
    """
    Scenario A Rule-based Parser: Extracts product queries and quantities using regular expressions.
    """
    lines = text.strip().split('\n')
    extracted_items = []
    
    # List of keywords to ignore as they are common conversational phrases
    ignore_keywords = ["hi bro", "dear sales", "regards", "best regards", "subject:", "sales team", "urgently", "delivery today", "let me know", "price thx"]
    
    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            continue

        # Skip attachment metadata headers (e.g. "[From attachment '1000197932.jpg']:")
        if re.match(r'^\[From attachment', line_clean, re.IGNORECASE):
            continue
            
        # Skip conversational lines
        if any(ignore in line_clean.lower() for ignore in ignore_keywords):
            continue
            
        # Remove list bullets or markers at start (e.g., "-", "•", "*", "1.", "2.")
        item_text = re.sub(r'^[•\-\*\s]+', '', line_clean).strip()
        # Remove leading numbered list prefix like "1." or "1)" or "1:"
        item_text = re.sub(r'^\d+[.):]\s*', '', item_text).strip()

        # Normalize dimension/special characters (inch symbols, ×, etc.)
        item_text = normalize_dimensions(item_text)

        # Clean common introductory phrases at the start of the line (case-insensitive)
        intro_prefixes = [
            r'^please\s+quote\s+the\s+following\s*:\s*',
            r'^please\s+quote\s+the\s+following\s*',
            r'^please\s+provide\s+pricing\s+for\s*:\s*',
            r'^please\s+provide\s+pricing\s+for\s*',
            r'^please\s+quote\s*:\s*',
            r'^please\s+quote\s*',
            r'^quote\s+for\s*',
            r'^quote\s*:\s*',
            r'^need\s+prices\s+for\s*:\s*',
            r'^need\s+prices\s+for\s*',
            r'^need\s+pricing\s+for\s*',
            r'^need\s+asap\s*',
            r'^need\s*',
            r'^hi\s+bro\s+need\s+asap\s*',
            r'^hi\s+bro\s+need\s*',
            r'^please\s+provide\s*',
            r'^please\s+send\s+pricing\s+for\s*',
        ]
        for pref in intro_prefixes:
            item_text = re.sub(pref, '', item_text, flags=re.IGNORECASE).strip()

        if not item_text:
            continue
            
        qty = 1
        product_query = item_text
        
        # 1. Look for quantity patterns at start (e.g. "12 brass elbow", "50 hex bolts")
        match_start = re.match(r'^(\d+)\s*(?:x|units|rolls|pcs|pieces|cans|lengths|boxes|bottles)?\s+(.+)', item_text, re.IGNORECASE)
        
        # 2. Look for quantity patterns at end (e.g. "brass elbow - 15 units", "hex bolts 100 pcs")
        match_end = re.search(r'\b[-–—]?\s*(\d+)\s*(?:units|rolls|pcs|pieces|cans|lengths|boxes|bottles|cans)?\s*$', item_text, re.IGNORECASE)
        
        if match_start:
            qty = int(match_start.group(1))
            product_query = match_start.group(2).strip()
        elif match_end:
            qty = int(match_end.group(1))
            # Remove quantity suffix from the product query
            product_query = item_text[:match_end.start()].strip()
            # Clean up trailing dashes
            product_query = re.sub(r'[-–—]$', '', product_query).strip()
            
        # Clean up generic helper words
        product_query = re.sub(r'\b(need|some|stuff|rolls of|cans of|lengths of|size|joints|and also matching)\b', '', product_query, flags=re.IGNORECASE)
        product_query = re.sub(r'\s+', ' ', product_query).strip()
        
        if len(product_query) > 2:
            extracted_items.append({
                "original_line": line_clean,
                "parsed_query": product_query,
                "quantity": qty
            })
            
    return extracted_items


def run_scenario_free(order_text, catalog):
    """
    Runs the complete Scenario A pipeline:
    1. Parse raw text into search queries and quantities.
    2. Run fuzzy string similarity & TF-IDF search on the catalog.
    3. Generate the best match for each line.
    """
    parsed_items = parse_order_text_rules(order_text)
    matched_lines = []
    
    for item in parsed_items:
        query = item['parsed_query']
        qty = item['quantity']
        
        # Get candidates from Fuzzy matching with high threshold (80)
        fuzzy_candidates = catalog.match_fuzzy(query, threshold=80, limit=3)
        # Get candidates from Local TF-IDF semantic matching
        tfidf_candidates = catalog.match_local_semantic(query, limit=3)
        
        # Combine lists and pick the best match
        combined = {}
        
        for cand in fuzzy_candidates:
            sku_id = cand['sku']['sku_id']
            combined[sku_id] = {
                "sku": cand['sku'],
                "score": cand['score'],
                "method": "Fuzzy Match"
            }
            
        for cand in tfidf_candidates:
            sku_id = cand['sku']['sku_id']
            if sku_id in combined:
                combined[sku_id]['score'] = max(combined[sku_id]['score'], cand['score'])
                combined[sku_id]['method'] = "Fuzzy + Semantic"
            else:
                combined[sku_id] = {
                    "sku": cand['sku'],
                    "score": cand['score'],
                    "method": "Local TF-IDF Match"
                }
                
        # Sort combined candidates by score descending
        sorted_candidates = sorted(combined.values(), key=lambda x: x['score'], reverse=True)
        
        # Enforce minimum matching score of 80.0% (nearing 90%)
        if sorted_candidates and sorted_candidates[0]['score'] >= 80.0:
            best_match = sorted_candidates[0]
            matched_lines.append({
                "original_line": item['original_line'],
                "parsed_query": query,
                "quantity": qty,
                "matched_sku_id": best_match['sku']['sku_id'],
                "matched_sku_name": best_match['sku']['sku_name'],
                "unit_price": best_match['sku']['price'],
                "confidence": best_match['score'],
                "match_method": best_match['method']
            })
        else:
            # No match found or score below threshold
            matched_lines.append({
                "original_line": item['original_line'],
                "parsed_query": query,
                "quantity": qty,
                "matched_sku_id": "UNKNOWN",
                "matched_sku_name": "No match found",
                "unit_price": 0.0,
                "confidence": 0.0,
                "match_method": "None"
            })
            
    return matched_lines
