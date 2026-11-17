import SwiftUI

struct AccountView: View {
    @State private var name = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                }
                Section {
                    Button("Save name") {}
                }
            }
            .font(.body)
            .navigationTitle("Account")
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
        }
    }
}
