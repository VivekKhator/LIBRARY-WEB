export const CATEGORIES = [
  { name: 'Fiction', slug: 'fiction', icon: 'feather', description: 'Novels, short stories and literary fiction.' },
  { name: 'Science Fiction & Fantasy', slug: 'scifi-fantasy', icon: 'rocket', description: 'Far futures, deep magic and everything between.' },
  { name: 'Mystery & Thriller', slug: 'mystery-thriller', icon: 'search', description: 'Whodunnits, heists and page-turners.' },
  { name: 'Technology', slug: 'technology', icon: 'cpu', description: 'Programming, architecture and craft.' },
  { name: 'Business & Economics', slug: 'business', icon: 'trending', description: 'Strategy, startups, markets and money.' },
  { name: 'Science & Nature', slug: 'science', icon: 'atom', description: 'Physics, biology, climate and cosmology.' },
  { name: 'History & Biography', slug: 'history', icon: 'scroll', description: 'Lives lived and eras that shaped us.' },
  { name: 'Self Development', slug: 'self-development', icon: 'compass', description: 'Habits, health, focus and craft.' },
  { name: 'Children & Young Adult', slug: 'children-ya', icon: 'star', description: 'Picture books through to YA epics.' },
  { name: 'Academic & Textbooks', slug: 'academic', icon: 'graduation', description: 'Course texts and reference works.' },
];

export const USERS = [
  { email: 'admin@bibliobazaar.test', name: 'Priya Raman', password: 'Admin1234', role: 'admin', storeName: 'BiblioBazaar Archive', bio: 'Platform steward and incurable marginalia writer.' },
  { email: 'seller@bibliobazaar.test', name: 'Marcus Webb', password: 'Seller1234', role: 'seller', storeName: 'The Dog-Eared Shelf', bio: 'Second-hand bookseller since 2009.', storeBio: 'Carefully graded used books from a Portland garage. Every spine inspected, every price fair.' },
  { email: 'reader@bibliobazaar.test', name: 'Aisha Donnelly', password: 'Reader1234', role: 'customer', bio: 'Reads two books a week, finishes maybe one.' },
  { email: 'lena@bibliobazaar.test', name: 'Lena Okafor', password: 'Seller1234', role: 'seller', storeName: 'Lantern & Leaf Books', storeBio: 'Independent shop specialising in speculative fiction and beautiful hardcovers.' },
  { email: 'tomas@bibliobazaar.test', name: 'Tomas Lindqvist', password: 'Seller1234', role: 'seller', storeName: 'Nordic Technical Press', storeBio: 'Engineering, computing and design titles. Bulk discounts for study groups.' },
  { email: 'nadia@bibliobazaar.test', name: 'Nadia Farrow', password: 'Seller1234', role: 'seller', storeName: 'Farrow Rare & Rental', storeBio: 'Rentals for students and collectors. Short loans, long memories.' },
  { email: 'ben@bibliobazaar.test', name: 'Ben Alvarez', password: 'Reader1234', role: 'customer' },
  { email: 'sofia@bibliobazaar.test', name: 'Sofia Ruiz', password: 'Reader1234', role: 'customer' },
  { email: 'kai@bibliobazaar.test', name: 'Kai Nakamura', password: 'Reader1234', role: 'customer' },
  { email: 'mira@bibliobazaar.test', name: 'Mira Chandra', password: 'Reader1234', role: 'customer' },
];

const b = (title, author, category, price, opts = {}) => ({ title, author, category, price, ...opts });

export const BOOKS = [
  b('The Midnight Library', 'Matt Haig', 'fiction', 12.99, { condition: 'like_new', pages: 304, year: 2020, publisher: 'Canongate', isbn: '9781786892737', rent: 2.2, description: 'Nora Seed finds herself in a library between life and death, where every book is a life she could have lived.' }),
  b('Normal People', 'Sally Rooney', 'fiction', 9.5, { condition: 'good', pages: 266, year: 2018, publisher: 'Faber & Faber', description: 'Connell and Marianne circle each other across school, university and the years that follow.' }),
  b('A Little Life', 'Hanya Yanagihara', 'fiction', 16.0, { condition: 'good', format: 'hardcover', pages: 720, year: 2015, publisher: 'Doubleday', description: 'Four friends in New York, and the one whose past will not let him go.' }),
  b('Klara and the Sun', 'Kazuo Ishiguro', 'fiction', 14.25, { condition: 'new', format: 'hardcover', pages: 303, year: 2021, publisher: 'Faber & Faber', rent: 2.5, description: 'An artificial friend watches the world from a shop window, waiting to be chosen.' }),
  b('Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', 'fiction', 15.75, { condition: 'new', pages: 416, year: 2022, publisher: 'Knopf', description: 'Two friends build games, companies and a friendship that outlasts both.' }),
  b('Lincoln in the Bardo', 'George Saunders', 'fiction', 8.99, { condition: 'fair', pages: 343, year: 2017, publisher: 'Random House', description: 'A chorus of ghosts narrates a single night of grief in a Georgetown cemetery.' }),

  b('Dune', 'Frank Herbert', 'scifi-fantasy', 11.99, { condition: 'good', pages: 688, year: 1965, publisher: 'Chilton Books', isbn: '9780441013593', rent: 2.0, description: 'Paul Atreides inherits a desert planet, a prophecy and the deadliest spice in the universe.' }),
  b('The Fifth Season', 'N. K. Jemisin', 'scifi-fantasy', 13.4, { condition: 'like_new', pages: 468, year: 2015, publisher: 'Orbit', rent: 2.4, description: 'In a world that ends regularly, orogenes can quell earthquakes - and are hated for it.' }),
  b('Project Hail Mary', 'Andy Weir', 'scifi-fantasy', 14.99, { condition: 'new', format: 'hardcover', pages: 476, year: 2021, publisher: 'Ballantine', description: 'A lone astronaut wakes with amnesia aboard a ship sent to save the sun.' }),
  b('Piranesi', 'Susanna Clarke', 'scifi-fantasy', 12.2, { condition: 'like_new', pages: 245, year: 2020, publisher: 'Bloomsbury', rent: 2.0, description: 'A man keeps careful records of an infinite house full of statues and tides.' }),
  b('The Left Hand of Darkness', 'Ursula K. Le Guin', 'scifi-fantasy', 10.5, { condition: 'good', pages: 304, year: 1969, publisher: 'Ace Books', description: 'An envoy arrives on a world without fixed gender, and must learn to be understood.' }),
  b('Babel', 'R. F. Kuang', 'scifi-fantasy', 17.5, { condition: 'new', format: 'hardcover', pages: 560, year: 2022, publisher: 'Harper Voyager', rent: 3.0, description: 'Translation is magic, empire runs on it, and Oxford sits at the centre of the web.' }),
  b('The Three-Body Problem', 'Liu Cixin', 'scifi-fantasy', 12.8, { condition: 'good', pages: 400, year: 2008, publisher: 'Tor Books', description: 'A physicist, a game and a signal that answers back across light years.' }),

  b('Gone Girl', 'Gillian Flynn', 'mystery-thriller', 8.75, { condition: 'good', pages: 415, year: 2012, publisher: 'Crown', description: 'A wife disappears on her anniversary and every story about the marriage starts to shift.' }),
  b('The Silent Patient', 'Alex Michaelides', 'mystery-thriller', 9.99, { condition: 'like_new', pages: 336, year: 2019, publisher: 'Celadon', rent: 1.8, description: 'She shot her husband and never spoke again. Her therapist intends to change that.' }),
  b('The Thursday Murder Club', 'Richard Osman', 'mystery-thriller', 10.25, { condition: 'new', pages: 382, year: 2020, publisher: 'Viking', description: 'Four retirement-village sleuths take on a real, inconveniently fresh murder.' }),
  b('Big Little Lies', 'Liane Moriarty', 'mystery-thriller', 7.99, { condition: 'fair', pages: 460, year: 2014, publisher: 'Putnam', description: 'School-gate rivalries build towards a death nobody will explain.' }),
  b('The Girl with the Dragon Tattoo', 'Stieg Larsson', 'mystery-thriller', 8.4, { condition: 'good', pages: 672, year: 2005, publisher: 'Norstedts', rent: 1.5, description: 'A disgraced journalist and a brilliant hacker dig into a forty-year-old disappearance.' }),

  b('The Pragmatic Programmer', 'David Thomas & Andrew Hunt', 'technology', 36.5, { condition: 'like_new', format: 'hardcover', pages: 352, year: 2019, publisher: 'Addison-Wesley', isbn: '9780135957059', rent: 5.5, description: 'The 20th anniversary edition of the classic guide to pragmatic software craft.' }),
  b('Designing Data-Intensive Applications', 'Martin Kleppmann', 'technology', 42.0, { condition: 'new', pages: 616, year: 2017, publisher: "O'Reilly", isbn: '9781449373320', rent: 6.0, description: 'The definitive tour of storage, replication, consensus and stream processing.' }),
  b('Clean Code', 'Robert C. Martin', 'technology', 28.99, { condition: 'good', pages: 464, year: 2008, publisher: 'Prentice Hall', rent: 4.0, description: 'A handbook of agile software craftsmanship, argued case by case.' }),
  b('Refactoring', 'Martin Fowler', 'technology', 39.0, { condition: 'like_new', format: 'hardcover', pages: 448, year: 2018, publisher: 'Addison-Wesley', rent: 5.0, description: 'Improving the design of existing code, one safe transformation at a time.' }),
  b('The Staff Engineer\'s Path', 'Tanya Reilly', 'technology', 34.5, { condition: 'new', pages: 352, year: 2022, publisher: "O'Reilly", description: 'Scope, influence and technical leadership beyond the senior title.' }),
  b('System Design Interview', 'Alex Xu', 'technology', 26.0, { condition: 'good', pages: 322, year: 2020, publisher: 'Independently published', rent: 4.5, description: 'An insider guide to structuring large-scale system design answers.' }),
  b('Crafting Interpreters', 'Robert Nystrom', 'technology', 44.0, { condition: 'new', format: 'hardcover', pages: 640, year: 2021, publisher: 'Genever Benning', description: 'Build two complete language implementations from first principles.' }),
  b('The Rust Programming Language', 'Steve Klabnik & Carol Nichols', 'technology', 31.5, { condition: 'like_new', pages: 560, year: 2023, publisher: 'No Starch Press', rent: 4.5, description: 'The official book on ownership, borrowing and fearless concurrency.' }),

  b('Zero to One', 'Peter Thiel', 'business', 13.99, { condition: 'good', pages: 224, year: 2014, publisher: 'Crown Business', description: 'Notes on startups, monopoly and building something genuinely new.' }),
  b('Thinking, Fast and Slow', 'Daniel Kahneman', 'business', 15.5, { condition: 'like_new', pages: 499, year: 2011, publisher: 'Farrar, Straus and Giroux', rent: 2.5, description: 'Two systems of thought, and the biases that live between them.' }),
  b('The Lean Startup', 'Eric Ries', 'business', 11.25, { condition: 'fair', pages: 336, year: 2011, publisher: 'Crown Business', description: 'Build-measure-learn as an operating system for new ventures.' }),
  b('Good Strategy Bad Strategy', 'Richard Rumelt', 'business', 17.0, { condition: 'new', pages: 336, year: 2011, publisher: 'Currency', rent: 2.8, description: 'Why most strategy documents are wish lists, and what a real kernel looks like.' }),
  b('Poor Charlie\'s Almanack', 'Charles T. Munger', 'business', 29.0, { condition: 'like_new', format: 'hardcover', pages: 552, year: 2005, publisher: 'Donning', description: 'Mental models, incentives and multidisciplinary thinking from Berkshire\'s vice chair.' }),

  b('Sapiens', 'Yuval Noah Harari', 'history', 14.75, { condition: 'good', pages: 443, year: 2011, publisher: 'Harvill Secker', isbn: '9780099590088', rent: 2.2, description: 'A brief history of humankind, from foraging bands to algorithmic empires.' }),
  b('The Immortal Life of Henrietta Lacks', 'Rebecca Skloot', 'history', 10.99, { condition: 'good', pages: 381, year: 2010, publisher: 'Crown', description: 'The woman behind HeLa cells, and the family science forgot to ask.' }),
  b('The Splendid and the Vile', 'Erik Larson', 'history', 16.5, { condition: 'like_new', format: 'hardcover', pages: 585, year: 2020, publisher: 'Crown', description: 'Churchill, family and defiance through the year of the Blitz.' }),
  b('Educated', 'Tara Westover', 'history', 12.5, { condition: 'like_new', pages: 334, year: 2018, publisher: 'Random House', rent: 2.0, description: 'A memoir of a survivalist childhood and an education that broke it open.' }),

  b('Entangled Life', 'Merlin Sheldrake', 'science', 15.25, { condition: 'new', pages: 368, year: 2020, publisher: 'Random House', rent: 2.4, description: 'Fungi, networks and a radically different way of being alive.' }),
  b('Cosmos', 'Carl Sagan', 'science', 13.0, { condition: 'good', pages: 396, year: 1980, publisher: 'Random House', description: 'The classic voyage through space, time and the scientific habit of mind.' }),
  b('The Order of Time', 'Carlo Rovelli', 'science', 11.4, { condition: 'like_new', pages: 240, year: 2017, publisher: 'Riverhead', rent: 1.9, description: 'Physics dismantles time, gently, and offers something stranger back.' }),
  b('An Immense World', 'Ed Yong', 'science', 17.25, { condition: 'new', format: 'hardcover', pages: 464, year: 2022, publisher: 'Random House', description: 'How animal senses reveal the hidden realms around us.' }),
  b('Braiding Sweetgrass', 'Robin Wall Kimmerer', 'science', 14.0, { condition: 'good', pages: 391, year: 2013, publisher: 'Milkweed Editions', rent: 2.1, description: 'Indigenous wisdom, scientific knowledge and the teachings of plants.' }),

  b('Atomic Habits', 'James Clear', 'self-development', 13.75, { condition: 'like_new', pages: 320, year: 2018, publisher: 'Avery', isbn: '9780735211292', rent: 2.2, description: 'A system for small changes that compound into remarkable results.' }),
  b('Deep Work', 'Cal Newport', 'self-development', 12.0, { condition: 'good', pages: 304, year: 2016, publisher: 'Grand Central', rent: 2.0, description: 'Rules for focused success in a distracted world.' }),
  b('Four Thousand Weeks', 'Oliver Burkeman', 'self-development', 13.5, { condition: 'new', pages: 288, year: 2021, publisher: 'Farrar, Straus and Giroux', description: 'Time management for mortals, which means giving up on getting everything done.' }),
  b('Why We Sleep', 'Matthew Walker', 'self-development', 11.99, { condition: 'good', pages: 368, year: 2017, publisher: 'Scribner', rent: 1.9, description: 'The science of sleep and the cost of going without it.' }),

  b('The Hobbit', 'J. R. R. Tolkien', 'children-ya', 9.25, { condition: 'good', pages: 310, year: 1937, publisher: 'Allen & Unwin', rent: 1.5, description: 'A reluctant burglar, thirteen dwarves and one very old dragon.' }),
  b('Percy Jackson and the Lightning Thief', 'Rick Riordan', 'children-ya', 8.5, { condition: 'fair', pages: 377, year: 2005, publisher: 'Disney Hyperion', description: 'Greek mythology crashes into a New York summer camp.' }),
  b('The Graveyard Book', 'Neil Gaiman', 'children-ya', 10.0, { condition: 'like_new', pages: 312, year: 2008, publisher: 'HarperCollins', rent: 1.6, description: 'Nobody Owens is raised by ghosts, which is safer than the alternative.' }),
  b('Wonder', 'R. J. Palacio', 'children-ya', 8.99, { condition: 'good', pages: 315, year: 2012, publisher: 'Knopf', description: 'Auggie Pullman starts fifth grade and asks the world to look properly.' }),
  b('Six of Crows', 'Leigh Bardugo', 'children-ya', 11.5, { condition: 'like_new', pages: 465, year: 2015, publisher: 'Henry Holt', rent: 1.8, description: 'Six outcasts, one impossible heist, zero trustworthy allies.' }),

  b('Introduction to Algorithms', 'Cormen, Leiserson, Rivest & Stein', 'academic', 79.0, { condition: 'good', format: 'hardcover', pages: 1312, year: 2022, publisher: 'MIT Press', isbn: '9780262046305', rent: 9.0, description: 'CLRS, fourth edition. The reference for algorithm design and analysis.' }),
  b('Linear Algebra Done Right', 'Sheldon Axler', 'academic', 48.5, { condition: 'like_new', pages: 390, year: 2015, publisher: 'Springer', rent: 6.5, description: 'Determinant-free linear algebra, built on operators from the start.' }),
  b('Principles of Economics', 'N. Gregory Mankiw', 'academic', 62.0, { condition: 'fair', format: 'hardcover', pages: 880, year: 2020, publisher: 'Cengage', rent: 8.0, description: 'Standard introductory economics text, used in hundreds of courses.' }),
  b('Campbell Biology', 'Lisa Urry et al.', 'academic', 88.0, { condition: 'good', format: 'hardcover', pages: 1488, year: 2020, publisher: 'Pearson', rent: 10.5, description: 'The comprehensive first-year biology text, richly illustrated.' }),
  b('Organic Chemistry', 'Paula Yurkanis Bruice', 'academic', 74.5, { condition: 'good', format: 'hardcover', pages: 1344, year: 2016, publisher: 'Pearson', rent: 9.5, description: 'Mechanism-first organic chemistry with worked problem sets.' }),

  b('Educated Mind, Audio Edition', 'Tara Westover', 'self-development', 18.0, { condition: 'new', format: 'audiobook', pages: 0, year: 2018, publisher: 'Random House Audio', description: 'Unabridged audio edition, 12 hours 10 minutes, read by Julia Whelan.' }),
  b('Meditations', 'Marcus Aurelius', 'self-development', 6.5, { condition: 'good', format: 'ebook', pages: 254, year: 180, publisher: 'Public domain', description: 'Stoic notes to self, written in camp and never meant for publication.' }),
  b('The Art of War', 'Sun Tzu', 'history', 5.99, { condition: 'new', format: 'ebook', pages: 112, year: -500, publisher: 'Public domain', description: 'Classical strategy, compressed into thirteen chapters.' }),
];

export const REVIEW_TEXTS = [
  { rating: 5, title: 'Could not put it down', body: 'Arrived faster than expected and in better condition than described. The book itself kept me up two nights running.' },
  { rating: 5, title: 'Exactly as listed', body: 'Spine tight, no markings, honest grading. This is how used book listings should be written.' },
  { rating: 4, title: 'Great read, small wear', body: 'A little shelf wear on the corners which the listing mentioned. Content is excellent and worth the price.' },
  { rating: 4, title: 'Solid copy', body: 'Good value for a secondhand edition. Shipping took a few days longer than estimated but packaging was careful.' },
  { rating: 3, title: 'Fine, not remarkable', body: 'The book did not land for me, though that is on the author rather than the seller. Condition was accurate.' },
  { rating: 5, title: 'Rented for a semester', body: 'Rental worked out far cheaper than buying and the extension flow was painless. Will borrow again.' },
  { rating: 4, title: 'Good for study', body: 'Used this for a module last term. A few highlighted passages from a previous reader, otherwise clean.' },
  { rating: 2, title: 'More worn than I hoped', body: 'Listed as good but the cover has a crease the photos did not show. Still readable and the seller replied quickly.' },
];
