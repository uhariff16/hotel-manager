import re
import os

filepath = r"c:\AntiGravity\Cheerful Chalet\src\components\OnboardingWizard.jsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update entityForm initial state
content = re.sub(
    r"const \[entityForm, setEntityForm\] = useState\(\{(.*?)\}\);",
    r"const [entityForm, setEntityForm] = useState({\1});\n".replace(
        "full_property_weekday_price: 10000,\n    full_property_weekend_price: 15000",
        ""
    ),
    content,
    flags=re.DOTALL
)

# 2. Update propertyForm initial state
new_property_form = """const [propertyForm, setPropertyForm] = useState({
    name: 'The Grand Villa',
    max_capacity: 10,
    number_of_rooms: 3,
    weekday_price: 15000,
    weekend_price: 20000,
    phone: '',
    wifi_password: ''
  });"""
content = re.sub(
    r"const \[propertyForm, setPropertyForm\] = useState\(\{.*?\}\);",
    new_property_form,
    content,
    flags=re.DOTALL
)

# 3. Replace roomGeneration with rooms array
new_rooms_state = """const [rooms, setRooms] = useState([]);
  const [roomMode, setRoomMode] = useState('auto');"""
content = re.sub(
    r"const \[roomGeneration, setRoomGeneration\] = useState\(\{.*?\}\);",
    new_rooms_state,
    content,
    flags=re.DOTALL
)

# 4. Update the useEffect that populates entityForm on resorts load
content = re.sub(
    r"full_property_weekday_price: r\.full_property_weekday_price \|\| 10000,\s*full_property_weekend_price: r\.full_property_weekend_price \|\| 15000",
    "",
    content
)

# 5. Update existingCottages population
content = re.sub(
    r"name: c\.name \|\| 'Deluxe Room',",
    r"name: c.name || 'The Grand Villa',\n        number_of_rooms: 3,",
    content
)

# 6. Update useEffect for step === 3
step3_effect = """useEffect(() => {
    if (step === 3 && rooms.length === 0) {
      generateRooms();
    }
  }, [step]);
  
  const generateRooms = () => {
    const numRooms = Number(propertyForm.number_of_rooms) || 1;
    const initialRooms = Array.from({ length: numRooms }).map((_, i) => ({
      id: Date.now() + i,
      name: String(101 + i),
      room_type: 'Standard Room',
      capacity: 2,
      weekday_price: 1500,
      weekend_price: 2000
    }));
    setRooms(initialRooms);
    setRoomMode('auto');
  };

  const addManualRoom = () => {
    setRooms([...rooms, {
      id: Date.now(),
      name: '',
      room_type: 'Standard Room',
      capacity: 2,
      weekday_price: 1500,
      weekend_price: 2000
    }]);
    setRoomMode('manual');
  };
  
  const updateRoom = (id, field, value) => {
    setRooms(rooms.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  
  const removeRoom = (id) => {
    setRooms(rooms.filter(r => r.id !== id));
  };"""

content = re.sub(
    r"useEffect\(\(\) => \{\s*if \(step === 3\) \{.*?\}\s*\}, \[step, propertyForm, existingCottages\]\);",
    step3_effect,
    content,
    flags=re.DOTALL
)

# 7. Step 1 validation
step1_validation = """if (step === 1) {
      if (!entityForm.name.trim()) return setError("Please enter your Property/Entity name.");
      if (!entityForm.phone.trim()) return setError("Please enter your Contact Phone.");
      if (!entityForm.email.trim()) return setError("Please enter your Email.");
    }"""
content = re.sub(
    r"if \(step === 1\) \{.*?\n\s*\} else if \(step === 2\)",
    step1_validation + " else if (step === 2)",
    content,
    flags=re.DOTALL
)

# 8. Step 2 validation
step2_validation = """if (!propertyForm.name.trim()) return setError("Please enter Property Name.");
      if (propertyForm.number_of_rooms < 1) return setError("Number of rooms must be at least 1.");"""
content = re.sub(
    r"if \(\!propertyForm\.name\.trim\(\)\) return setError\(\"Please enter a category name \(e\.g\. Standard Room\)\.\"\);",
    step2_validation,
    content
)

# 9. Step 1 Submit payload (remove full_property_prices)
content = re.sub(
    r"full_property_weekday_price: Number\(entityForm\.full_property_weekday_price\),\s*full_property_weekend_price: Number\(entityForm\.full_property_weekend_price\)",
    "",
    content
)

# 10. Step 2 Submit payload (resolvedName -> propertyForm.name)
content = re.sub(
    r"const resolvedName = propertyForm\.name === 'Other' \? \(propertyForm\.customName \|\| 'Custom Room'\) : propertyForm\.name;\s*setStatusMessage\(\"Updating property category\.\.\.\"\);\s*const cottagePayload = \{",
    """setStatusMessage("Updating property class...");
        const cottagePayload = {""",
    content,
    flags=re.DOTALL
)
content = re.sub(
    r"name: resolvedName,",
    r"name: propertyForm.name,",
    content
)
content = re.sub(
    r"const resolvedName = propertyForm\.name === 'Other' \? \(propertyForm\.customName \|\| 'Custom Room'\) : propertyForm\.name;\s*setStatusMessage\(\"Creating property categories\.\.\.\"\);\s*const cottagePayload = \{",
    """setStatusMessage("Creating property class...");
        const cottagePayload = {""",
    content,
    flags=re.DOTALL
)

# 11. Step 3 Submit logic (rooms)
step3_submit = """setStatusMessage("Generating rooms...");
      if (rooms.length === 0) throw new Error("Please add at least one room.");
      if (rooms.some(r => !r.name.trim())) throw new Error("All rooms must have a name/number.");
      
      const roomsToInsert = rooms.map(r => ({
        cottage_id: activeCottage.id,
        name: r.name,
        room_type: r.room_type,
        capacity: Number(r.capacity),
        weekday_price: Number(r.weekday_price),
        weekend_price: Number(r.weekend_price),
        seasonal_price: 0,
        status: 'Available',
        tenant_id: session.user.id,
        resort_id: activeResort.id
      }));"""
content = re.sub(
    r"setStatusMessage\(\"Generating initial rooms\.\.\.\"\);.*?(const \{ error: roomsError \} = await supabase)",
    step3_submit + "\n\n      \\1",
    content,
    flags=re.DOTALL
)

with open('rewrite.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Pre-processed Javascript!")
