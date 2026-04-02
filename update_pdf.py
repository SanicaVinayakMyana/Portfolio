import sys
from pypdf import PdfReader, PdfWriter

def update_metadata(input_path, output_path, new_title):
    try:
        reader = PdfReader(input_path)
        writer = PdfWriter()

        # Add all pages to the writer
        for page in reader.pages:
            writer.add_page(page)

        # Get existing metadata
        metadata = reader.metadata or {}
        
        # Update metadata dictionary
        # pypdf expects dictionary entries to start with '/'
        new_metadata = {k: v for k, v in metadata.items()}
        new_metadata['/Title'] = new_title

        # Write metadata
        writer.add_metadata(new_metadata)

        # Save the new PDF
        with open(output_path, 'wb') as output_file:
            writer.write(output_file)
            
        print(f"Successfully updated metadata. New title: {new_title}")
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python update_pdf.py <input> <output> <title>")
        sys.exit(1)
        
    input_pdf = sys.argv[1]
    output_pdf = sys.argv[2]
    title = sys.argv[3]
    
    update_metadata(input_pdf, output_pdf, title)
