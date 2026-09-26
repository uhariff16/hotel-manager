import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { base64Image, side } = await req.json()
    if (!base64Image) {
      throw new Error('base64Image is required in request body')
    }

    const promptText = `
      You are an OCR and ID parsing AI. Extract the text from this Indian ID card image (could be Aadhaar, PAN, DL, Voter ID).
      Ignore regional scripts (Hindi/Tamil/etc). Only extract English text.
      Return EXACTLY a JSON object and nothing else. Do not use markdown blocks.
      Extract ALL the following fields if they exist in the image. If a field does not exist in the image, return an empty string for it.
      {
        "idType": "Aadhar" | "Pan Card" | "Driving License" | "Voter ID" | "Passport" | "Other",
        "idNumber": "extracted number",
        "name": "Full English Name",
        "door_no": "House/Door/Flat number if available, else empty",
        "street": "Street/Locality/Area name",
        "city": "Town or City",
        "state": "State",
        "pincode": "6 digit pincode"
      }
      Rules:
      - For Aadhaar, the number format is XXXX-XXXX-XXXX (insert dashes if missing).
      - Ensure the name contains ONLY English letters.
      - IMPORTANT: For Passports, strictly extract ONLY the 'Given Name(s)' field as the 'name'. Do NOT include the Surname.
    `

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }

    // Using gemini-flash-latest which auto-routes to the production model with highest quota!
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`
    const body = {
      contents: [{
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: base64Image
            }
          }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json",
      }
    }

    let geminiRes;
    let errText = "";
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (geminiRes.ok) break;
      
      errText = await geminiRes.text();
      
      if (geminiRes.status === 503 && attempt < maxRetries) {
        console.log("Google API overloaded (Attempt " + attempt + "). Retrying in 2 seconds...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        throw new Error('Gemini API Error: ' + errText);
      }
    }

    const geminiData = await geminiRes.json()
    const textResponse = geminiData.candidates[0].content.parts[0].text
    
    let parsedData = {};
    try {
      const cleanText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanText);
    } catch (e) {
      throw new Error("Failed to parse AI response: " + textResponse);
    }

    return new Response(
      JSON.stringify(parsedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  }
})
