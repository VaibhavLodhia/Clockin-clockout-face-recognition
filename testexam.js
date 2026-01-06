import { JSDOM } from "jsdom";

const BASE_URL =
  "https://tns4lpgmziiypnxxzel5ss5nyu0nftol.lambda-url.us-east-1.on.aws/challenge";

async function extractValidCharacter() {
  // Fetch HTML from the BASE_URL
  const response = await fetch(BASE_URL);
  const html = await response.text();
  
  // Parse HTML with JSDOM
  const dom = new JSDOM(html);
  const document = dom.window.document;
  
  // Follow the DOM structure: section[data-id] -> article -> div[data-tag] -> b.ref
  // Collect all characters from all matching b.ref elements
  const sections = document.querySelectorAll("section[data-id]");
  const characters = [];
  
  // Search through all sections
  for (const section of sections) {
    // Find article inside the section
    const articles = section.querySelectorAll("article");
    
    for (const article of articles) {
      // Find div with data-tag attribute inside the article
      const divs = article.querySelectorAll("div[data-tag]");
      
      for (const div of divs) {
        // Find b element with class="ref" inside the div (not "ref0")
        // Use a more specific selector to ensure we only get "ref", not "ref0"
        const bElements = div.querySelectorAll("b");
        
        for (const b of bElements) {
          const classList = b.getAttribute("class") || "";
          // Check if it has "ref" class but not "ref0"
          if (classList.includes("ref") && !classList.includes("ref0")) {
            const value = b.getAttribute("value");
            if (value) {
              characters.push(value);
            }
          }
        }
      }
    }
  }
  
  if (characters.length === 0) {
    throw new Error("Could not find any matching b.ref elements");
  }
  
  // Concatenate all characters to form the path
  const path = characters.join("");
  
  // Check if it's a full URL or just a path
  let finalUrl;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    // It's a full URL, use it directly
    finalUrl = path;
  } else {
    // It's a path, append to BASE_URL
    finalUrl = BASE_URL + "/" + path;
  }
  
  console.log(finalUrl);
  
  // Fetch from the final URL
  try {
    const finalResponse = await fetch(finalUrl);
    const finalHtml = await finalResponse.text();
    console.log("Response from final URL:", finalHtml);
  } catch (error) {
    console.error("Error fetching final URL:", error.message);
  }
  
  return finalUrl;
}

extractValidCharacter().catch(console.error);